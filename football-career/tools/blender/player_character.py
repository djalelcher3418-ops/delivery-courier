"""شخصية لاعب لـ«حلم الملاعب» — سكربت Blender

يبني رجلاً رياضياً بوضعية T مثل صور المرجع: قميص بلا أكمام أسود، شورت ضاغط أسود،
حافي القدمين، شعر مربوط (كعكة)، مع هيكل عظمي (Armature) جاهز للتحريك، وأستوديو
تصوير شبيه بالصور (خلفية رمادية، قاعدة دوّارة، إضاءتان كبيرتان).

الاستعمال داخل Blender (3.6 أو أحدث):
    Scripting ← Open ← اختر هذا الملف ← Run Script

أو من الطرفية بدون واجهة:
    blender -b -P player_character.py -- --glb player.glb --render preview.png

الإعدادات في أعلى الملف (الطول، لون البشرة، صور المرجع...) يمكن تغييرها قبل التشغيل.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Vector

# ---------------- الإعدادات ----------------
HEIGHT = 1.78                 # طول اللاعب بالمتر
SKIN_COLOR = (0.74, 0.55, 0.42)    # لون البشرة كما يظهر على الشاشة
CLOTH_COLOR = (0.06, 0.06, 0.065)
HAIR_COLOR = (0.09, 0.07, 0.06)
STUDIO = True                 # خلفية رمادية وقاعدة دوّارة وإضاءة مثل الصور
FRONT_IMAGE = ""              # مسار صورة المرجع الأمامية (اختياري) تظهر خلف الشخصية للمقارنة
SIDE_IMAGE = ""               # مسار صورة المرجع الجانبية (اختياري)
GLB_PATH = ""                 # مسار تصدير GLB للعبة (اختياري)
FBX_PATH = ""                 # مسار تصدير FBX لموقع Mixamo (المجسم فقط بدون هيكل)
RENDER_PATH = ""              # مسار صورة معاينة (اختياري)

S = HEIGHT / 1.78             # كل المقاسات أدناه لطول 1.78 م، وتُضرب في S


def parse_args():
    global GLB_PATH, FBX_PATH, RENDER_PATH, FRONT_IMAGE, SIDE_IMAGE
    if '--' not in sys.argv:
        return
    args = sys.argv[sys.argv.index('--') + 1:]
    keys = {'--glb': 'GLB_PATH', '--fbx': 'FBX_PATH', '--render': 'RENDER_PATH', '--front': 'FRONT_IMAGE', '--side': 'SIDE_IMAGE'}
    for i, a in enumerate(args):
        if a in keys and i + 1 < len(args):
            globals()[keys[a]] = args[i + 1]


# ---------------- تنظيف المشهد ----------------
def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


# ---------------- المواد ----------------
def set_input(node, names, value):
    """يضبط مدخلاً في Principled BSDF مهما اختلف اسمه بين إصدارات Blender."""
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return


def srgb_to_linear(c):
    # الألوان في الإعدادات كما تراها على الشاشة (sRGB)، وBlender يعمل بألوان خطية
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def make_material(name, color, roughness, subsurface=0.0, sheen=0.0):
    color = srgb_to_linear(color)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    set_input(bsdf, ['Base Color'], (*color, 1))
    set_input(bsdf, ['Roughness'], roughness)
    if subsurface:
        set_input(bsdf, ['Subsurface Weight', 'Subsurface'], subsurface)
        set_input(bsdf, ['Subsurface Radius'], (0.9, 0.45, 0.25))
        set_input(bsdf, ['Subsurface Scale'], 0.01)
    if sheen:
        set_input(bsdf, ['Sheen Weight', 'Sheen'], sheen)
    mat.diffuse_color = (*color, 1)  # اللون في وضع المعاينة السريعة
    return mat


# ---------------- الجسم: أنابيب بمقاطع بيضاوية + عضلات، تُدمج بإعادة بناء فوكسل ----------------
# كل نقطة: (الاسم، الموضع x,y,z بالمتر، نصف القطر الأول، نصف القطر الثاني)
# الجذع والساقان: (نصف العرض، نصف العمق). الذراعان: (نصف السُّمك العمودي، نصف العمق). القدمان: (نصف العرض، نصف الارتفاع)
# المحاور: x يسار(+)/يمين(-)، y أمام(-)/خلف(+)، z للأعلى. وضعية T مثل صور المرجع
BODY_POINTS = [
    ('crotch',   (0, 0.01, 0.85), 0.14, 0.085),
    ('pelvis',   (0, 0.008, 0.95), 0.178, 0.112),
    ('abdomen',  (0, 0.0, 1.05), 0.148, 0.103),
    ('waist',    (0, 0.0, 1.14), 0.14, 0.098),
    ('ribs',     (0, -0.004, 1.25), 0.158, 0.112),
    ('chest',    (0, -0.006, 1.35), 0.172, 0.115),
    ('upchest',  (0, 0.004, 1.43), 0.165, 0.098),
    ('neckbase', (0, 0.012, 1.50), 0.074, 0.07),
    ('neck',     (0, 0.012, 1.54), 0.067, 0.067),
    ('neckTop',  (0, 0.004, 1.58), 0.06, 0.062),
]
for side, sx in (('L', 1), ('R', -1)):
    BODY_POINTS += [
        (f'clav{side}',     (sx * 0.12, 0.006, 1.44), 0.06, 0.06),
        (f'shoulder{side}', (sx * 0.2, 0.006, 1.445), 0.068, 0.07),
        (f'uparm{side}',    (sx * 0.32, 0.006, 1.447), 0.054, 0.057),
        (f'elbow{side}',    (sx * 0.46, 0.006, 1.447), 0.04, 0.042),
        (f'forearm{side}',  (sx * 0.555, 0.006, 1.447), 0.05, 0.048),
        (f'wrist{side}',    (sx * 0.69, 0.006, 1.447), 0.031, 0.034),
        (f'hand{side}',     (sx * 0.765, 0.006, 1.443), 0.024, 0.05),
        (f'fingers{side}',  (sx * 0.84, 0.006, 1.44), 0.018, 0.046),
        (f'tips{side}',     (sx * 0.875, 0.006, 1.438), 0.012, 0.034),
        (f'hip{side}',      (sx * 0.098, 0.006, 0.9), 0.088, 0.09),
        (f'thigh{side}',    (sx * 0.102, -0.004, 0.74), 0.082, 0.086),
        (f'knee{side}',     (sx * 0.105, -0.01, 0.5), 0.056, 0.06),
        (f'calf{side}',     (sx * 0.106, 0.014, 0.36), 0.064, 0.068),
        (f'ankle{side}',    (sx * 0.108, 0.01, 0.085), 0.032, 0.034),
        (f'heel{side}',     (sx * 0.108, 0.03, 0.045), 0.035, 0.04),
        (f'foot{side}',     (sx * 0.112, -0.07, 0.034), 0.044, 0.032),
        (f'toes{side}',     (sx * 0.115, -0.15, 0.024), 0.04, 0.018),
    ]
CHAINS = [['crotch', 'pelvis', 'abdomen', 'waist', 'ribs', 'chest', 'upchest', 'neckbase', 'neck', 'neckTop']]
for side in 'LR':
    CHAINS += [
        [f'clav{side}', f'shoulder{side}', f'uparm{side}', f'elbow{side}', f'forearm{side}', f'wrist{side}', f'hand{side}', f'fingers{side}', f'tips{side}'],
        [f'hip{side}', f'thigh{side}', f'knee{side}', f'calf{side}', f'ankle{side}'],
        [f'heel{side}', f'foot{side}', f'toes{side}'],
    ]
# عضلات تعطي الجسم شكلاً رياضياً: (المركز، أنصاف الأقطار x,y,z)
MUSCLES = []
for sx in (1, -1):
    MUSCLES += [
        ((sx * 0.08, -0.065, 1.355), (0.085, 0.045, 0.06)),    # الصدر
        ((sx * 0.205, 0.004, 1.448), (0.08, 0.075, 0.075)),    # الكتف (الدالية)
        ((sx * 0.095, 0.03, 1.49), (0.09, 0.055, 0.05)),       # شبه المنحرفة
        ((sx * 0.072, 0.055, 0.9), (0.085, 0.06, 0.085)),      # الأرداف
        ((sx * 0.106, 0.032, 0.39), (0.058, 0.052, 0.1)),      # بطة الساق
        ((sx * 0.1, -0.03, 0.76), (0.064, 0.055, 0.13)),       # الفخذ الأمامي
        ((sx * 0.31, -0.012, 1.447), (0.09, 0.04, 0.048)),     # العضلة ذات الرأسين
        ((sx * 0.07, 0.06, 1.3), (0.1, 0.05, 0.12)),           # الظهر العريض
    ]
VOXEL = 0.012   # دقة الدمج بالمتر: أصغر = تفاصيل أدق وملف أثقل


def tube(bm, pts):
    """أنبوب يمر بالنقاط بمقاطع بيضاوية، مع تقسيم كل 3 سم ونهايتين مغلقتين."""
    seg = 18
    samples = []
    for i in range(len(pts) - 1):
        (a, ra), (b, rb) = pts[i], pts[i + 1]
        n = max(1, int((b - a).length / (0.03 * S)))
        for k in range(n):
            t = k / n
            tt = t * t * (3 - 2 * t)  # انتقال ناعم بين المقاسات
            samples.append((a.lerp(b, t), (ra[0] + (rb[0] - ra[0]) * tt, ra[1] + (rb[1] - ra[1]) * tt)))
    samples.append(pts[-1])
    rings = []
    for i, (c, (r1, r2)) in enumerate(samples):
        nxt = samples[min(i + 1, len(samples) - 1)][0]
        prv = samples[max(i - 1, 0)][0]
        T = (nxt - prv).normalized()
        ref = Vector((0, 0, 1)) if abs(T.y) > 0.9 else Vector((0, 1, 0))
        V = (ref - T * ref.dot(T)).normalized()
        U = T.cross(V)
        rings.append([bm.verts.new(c + U * math.cos(a) * r1 + V * math.sin(a) * r2)
                      for a in (j / seg * 2 * math.pi for j in range(seg))])
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(seg):
            bm.faces.new((r0[j], r0[(j + 1) % seg], r1[(j + 1) % seg], r1[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def ellipsoid(bm, center, radius, segs=20, rings=12):
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in ret['verts']:
        v.co = Vector((v.co.x * radius[0], v.co.y * radius[1], v.co.z * radius[2])) + center


def build_body_mesh():
    """الجسم كاملاً (مع الرأس والأذنين والأنف) قطعة واحدة ناعمة."""
    pts = {n: (Vector(c) * S, (r1 * S, r2 * S)) for n, c, r1, r2 in BODY_POINTS}
    bm = bmesh.new()
    for chain in CHAINS:
        tube(bm, [pts[n] for n in chain])
    for c, r in MUSCLES:
        ellipsoid(bm, Vector(c) * S, Vector(r) * S)
    head_sphere(bm)
    for sx in (1, -1):
        ellipsoid(bm, Vector((sx * 0.08, 0.01, HEAD_C[2] - 0.005)) * S, Vector((0.014, 0.026, 0.034)) * S, 12, 8)
    ellipsoid(bm, Vector((0, -0.097, HEAD_C[2] - 0.018)) * S, Vector((0.015, 0.022, 0.026)) * S, 12, 8)
    raw = bpy.data.meshes.new('BodyParts')
    bm.to_mesh(raw)
    bm.free()
    ob = bpy.data.objects.new('BodyParts', raw)
    bpy.context.scene.collection.objects.link(ob)
    rm = ob.modifiers.new('Remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = VOXEL * S
    sm = ob.modifiers.new('Smooth', 'SMOOTH')
    sm.factor, sm.iterations = 0.5, 10
    dg = bpy.context.evaluated_depsgraph_get()
    body = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(raw)
    return body


# ---------------- الرأس والشعر والوجه ----------------
def add_sphere(bm, center, radius, segs=24, rings=16, taper=None, keep=None):
    """يضيف كرة إلى bmesh ويعيد وجوهها. taper(v) يعدّل الرأس (فك أضيق)، keep(v) يحذف ما لا يلزم."""
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    vs = ret['verts']
    for v in vs:
        v.co = Vector((v.co.x * radius[0], v.co.y * radius[1], v.co.z * radius[2]))
        if taper:
            taper(v)
    if keep:  # يُقرَّر بالإحداثيات المحلية قبل نقل الكرة إلى مكانها
        bmesh.ops.delete(bm, geom=[v for v in vs if not keep(v)], context='VERTS')
        vs = [v for v in vs if v.is_valid]
    for v in vs:
        v.co += Vector(center)
    faces = list({f for v in vs for f in v.link_faces})
    return faces


HEAD_C = (0, 0.006, 1.665)
HEAD_R = (0.081, 0.099, 0.117)


def head_sphere(bm):
    hc = Vector(HEAD_C) * S
    add_sphere(bm, hc, tuple(r * S for r in HEAD_R), 32, 20, taper=jaw_taper)


def jaw_taper(v):
    # الجزء السفلي من الرأس أضيق (الفك والذقن)، والجبهة أعرض قليلاً
    if v.co.z < 0:
        t = min(1, -v.co.z / 0.115)
        v.co.x *= 1 - 0.2 * t * t
        v.co.y = v.co.y * (1 - 0.12 * t) - 0.004 * t
    else:
        v.co.y += 0.006 * (v.co.z / 0.115)


# ---------------- الملابس: تحديد مادة كل وجه حسب موضعه ----------------
SKIN, SHIRT, SHORTS, HAIR, EYES = range(5)


def cloth_for(c):
    x, y, z = c.x / S, c.y / S, c.z / S
    ax = abs(x)
    if 0.60 < z < 0.985 and ax < 0.25:
        return SHORTS
    if 0.965 <= z < 1.53 and ax < 0.215:
        if z > 1.25 and ax > 0.165 - (z - 1.25) * 0.15:
            return SKIN            # فتحة الذراع الواسعة
        if z > 1.39 and y < -0.02 and ax < 0.085:
            return SKIN            # فتحة الرقبة من الأمام
        if z > 1.45 and y >= -0.02 and ax < 0.07:
            return SKIN            # الرقبة من الخلف
        if z > 1.42 and not (0.07 < ax < 0.145):
            return SKIN            # فوق حمّالتي القميص
        return SHIRT
    return SKIN


def cut_garment_edges(bm):
    """يقصّ المجسم بمستويات على حدود الملابس حتى تكون حوافها مستقيمة نظيفة بدل الحواف المسننة."""
    planes = [
        ((0, 0, 0.62), (0, 0, 1)),        # حافة الشورت
        ((0, 0, 0.985), (0, 0, 1)),       # أسفل القميص
        ((0, 0, 1.39), (0, 0, 1)),        # فتحة الرقبة من الأمام
        ((0, 0, 1.42), (0, 0, 1)),        # بداية الحمّالتين
        ((0, 0, 1.45), (0, 0, 1)),
        ((0, -0.02, 0), (0, 1, 0)),
    ]
    for sx in (1, -1):
        planes += [
            ((sx * 0.165, 0, 1.25), (sx * 1, 0, 0.15)),   # فتحة الذراع
            ((sx * 0.07, 0, 0), (1, 0, 0)), ((sx * 0.145, 0, 0), (1, 0, 0)),  # الحمّالتان
            ((sx * 0.085, 0, 0), (1, 0, 0)), ((sx * 0.065, 0, 0), (1, 0, 0)),
        ]
    for co, no in planes:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co) * S, plane_no=Vector(no).normalized())
    bm.verts.ensure_lookup_table()


# ---------------- الهيكل العظمي (أسماء على نمط Mixamo) ----------------
def bone_defs(floor_z):
    lift = Vector((0, 0, floor_z))
    p = {n: Vector(c) * S + lift for n, c, *_ in BODY_POINTS}
    up = Vector((0, 0, 1))
    b = [
        ('Hips', p['pelvis'], p['pelvis'] + up * 0.1 * S, None),
        ('Spine', p['pelvis'] + up * 0.1 * S, p['waist'], 'Hips'),
        ('Spine1', p['waist'], p['chest'], 'Spine'),
        ('Spine2', p['chest'], p['neckbase'], 'Spine1'),
        ('Neck', p['neckbase'], p['neckTop'], 'Spine2'),
        ('Head', p['neckTop'], Vector((0, 0, HEAD_C[2] + 0.12)) * S + lift, 'Neck'),
    ]
    for side, name in (('L', 'Left'), ('R', 'Right')):
        b += [
            (f'{name}Shoulder', p['upchest'] + Vector((0, 0, 0.02)) * S, p[f'shoulder{side}'], 'Spine2'),
            (f'{name}Arm', p[f'shoulder{side}'], p[f'elbow{side}'], f'{name}Shoulder'),
            (f'{name}ForeArm', p[f'elbow{side}'], p[f'wrist{side}'], f'{name}Arm'),
            (f'{name}Hand', p[f'wrist{side}'], p[f'fingers{side}'], f'{name}ForeArm'),
            (f'{name}UpLeg', p[f'hip{side}'], p[f'knee{side}'], 'Hips'),
            (f'{name}Leg', p[f'knee{side}'], p[f'ankle{side}'], f'{name}UpLeg'),
            (f'{name}Foot', p[f'ankle{side}'], p[f'foot{side}'], f'{name}Leg'),
            (f'{name}ToeBase', p[f'foot{side}'], p[f'toes{side}'], f'{name}Foot'),
        ]
    return b


def seg_dist(pt, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (pt - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (a + ab * t - pt).length


def build_armature(mesh_ob, head_verts, floor_z):
    arm_data = bpy.data.armatures.new('PlayerRig')
    arm = bpy.data.objects.new('PlayerRig', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    defs = bone_defs(floor_z)
    for name, head, tail, parent in defs:
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        if parent:
            eb.parent = arm_data.edit_bones[parent]
            eb.use_connect = (eb.parent.tail - head).length < 1e-4
    bpy.ops.object.mode_set(mode='OBJECT')

    # الأوزان: كل نقطة تتبع أقرب عظمتين بنعومة (بدون الاعتماد على Bone Heat الذي يفشل أحياناً)
    groups = {name: mesh_ob.vertex_groups.new(name=name) for name, *_ in defs}
    segs = [(name, h, t) for name, h, t, _ in defs]
    for v in mesh_ob.data.vertices:
        if v.index in head_verts:
            groups['Head'].add([v.index], 1.0, 'REPLACE')
            continue
        d = sorted((seg_dist(v.co, h, t), name) for name, h, t in segs)
        (d1, n1), (d2, n2) = d[0], d[1]
        w1, w2 = 1 / (d1 ** 4 + 1e-10), 1 / (d2 ** 4 + 1e-10)
        if d2 > d1 * 1.8:
            w2 = 0
        tot = w1 + w2
        groups[n1].add([v.index], w1 / tot, 'REPLACE')
        if w2:
            groups[n2].add([v.index], w2 / tot, 'ADD')
    mod = mesh_ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mesh_ob.parent = arm
    return arm


# ---------------- الأستوديو ----------------
def build_studio(floor_z):
    gray = make_material('StudioGray', (0.55, 0.55, 0.55), 0.9)
    dark = make_material('Turntable', (0.18, 0.18, 0.19), 0.5)
    bm = bmesh.new()
    # خلفية منحنية (cyclorama): أرضية تنحني إلى جدار
    w, depth, h, r = 8.0, 6.0, 5.0, 1.2
    prof = [(-depth / 2, 0)]
    for i in range(13):
        a = i / 12 * math.pi / 2
        prof.append((depth / 2 - r + math.sin(a) * r, r - math.cos(a) * r))
    prof.append((depth / 2, h))
    rows = []
    for x in (-w / 2, w / 2):
        rows.append([bm.verts.new((x, y, z)) for y, z in prof])
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    me = bpy.data.meshes.new('Backdrop')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(gray)
    for poly in me.polygons:
        poly.use_smooth = True
    bpy.context.scene.collection.objects.link(bpy.data.objects.new('Backdrop', me))

    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=0.45, radius2=0.45, depth=floor_z)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, floor_z / 2))
    me = bpy.data.meshes.new('Turntable')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(dark)
    bpy.context.scene.collection.objects.link(bpy.data.objects.new('Turntable', me))

    # إضاءتان كبيرتان (softbox) على الجانبين مثل الصور
    for x in (-2.2, 2.2):
        ld = bpy.data.lights.new('Softbox', 'AREA')
        ld.energy = 220
        ld.shape = 'RECTANGLE'
        ld.size, ld.size_y = 0.9, 1.8
        lo = bpy.data.objects.new('Softbox', ld)
        lo.location = (x, -2.0, 1.9)
        direction = Vector((0, 0, 1.1)) - lo.location
        lo.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.collection.objects.link(lo)
    fill = bpy.data.lights.new('Fill', 'AREA')
    fill.energy = 60
    fill.size = 3
    fo = bpy.data.objects.new('Fill', fill)
    fo.location = (0, -3.5, 2.6)
    fo.rotation_euler = (Vector((0, 0, 1.0)) - fo.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(fo)

    cam_data = bpy.data.cameras.new('Camera')
    cam_data.lens = 50
    cam = bpy.data.objects.new('Camera', cam_data)
    cam.location = (0, -5.6, 1.05 + floor_z)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam


def add_reference(path, location, rotation, name):
    if not path:
        return
    img = bpy.data.images.load(path)
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = 'IMAGE'
    empty.data = img
    empty.empty_display_size = HEIGHT * 1.15
    empty.location = location
    empty.rotation_euler = rotation
    empty.color[3] = 0.5
    bpy.context.scene.collection.objects.link(empty)


# ---------------- البناء ----------------
def build():
    parse_args()
    clear_scene()
    floor_z = 0.06 * S if STUDIO else 0.0

    mats = [
        make_material('Skin', SKIN_COLOR, 0.45, subsurface=0.15),
        make_material('Shirt', CLOTH_COLOR, 0.8, sheen=0.15),
        make_material('Shorts', CLOTH_COLOR, 0.55, sheen=0.1),
        make_material('Hair', HAIR_COLOR, 0.5),
        make_material('Eyes', (0.12, 0.08, 0.06), 0.15),
    ]

    bm = bmesh.new()
    bm.from_mesh(build_body_mesh())
    cut_garment_edges(bm)
    for f in bm.faces:
        f.material_index = cloth_for(f.calc_center_median())
        f.smooth = True
    n_body = len(bm.verts)
    head_skin = {v.index for v in bm.verts if v.co.z > (HEAD_C[2] - 0.075) * S}

    hc = Vector(HEAD_C) * S
    hr = tuple(r * S for r in HEAD_R)
    # الشعر: غطاء فوق الرأس (يبدأ من الجبهة) + كعكة في الأعلى
    cap = add_sphere(bm, hc + Vector((0, 0.003, 0.004)) * S, (hr[0] * 1.07, hr[1] * 1.07, hr[2] * 1.06), 32, 20,
                     keep=lambda v: v.co.z > (0.035 if v.co.y < 0 else -0.04) * S + (0.0 if abs(v.co.x) < 0.07 * S else -0.025 * S))
    for f in cap:
        f.material_index = HAIR
    for f in add_sphere(bm, Vector((0, 0.037, HEAD_C[2] + 0.125)) * S, (0.04 * S, 0.042 * S, 0.034 * S), 16, 10):
        f.material_index = HAIR
    # العينان والحاجبان
    for sx in (1, -1):
        for f in add_sphere(bm, Vector((sx * 0.031, -0.09, HEAD_C[2] + 0.015)) * S, (0.011 * S, 0.006 * S, 0.0075 * S), 12, 8):
            f.material_index = EYES
        for f in add_sphere(bm, Vector((sx * 0.031, -0.089, HEAD_C[2] + 0.032)) * S, (0.018 * S, 0.006 * S, 0.004 * S), 10, 6):
            f.material_index = HAIR
    for f in bm.faces:
        f.smooth = True
    head_verts = set(range(n_body, len(bm.verts))) | head_skin

    if floor_z:
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, floor_z))
    me = bpy.data.meshes.new('Player')
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    player = bpy.data.objects.new('Player', me)
    bpy.context.scene.collection.objects.link(player)
    # يقرؤها سكربت تحسين الوجه (player_face.py) ليضع الرأس الجديد في المكان نفسه
    player['head_center'] = HEAD_C
    player['scale'] = S
    player['floor_z'] = floor_z

    arm = build_armature(player, head_verts, floor_z)

    if STUDIO:
        build_studio(floor_z)
    add_reference(FRONT_IMAGE, (0, 1.2, HEIGHT / 2 + floor_z), (math.radians(90), 0, 0), 'RefFront')
    add_reference(SIDE_IMAGE, (-1.2, 0, HEIGHT / 2 + floor_z), (math.radians(90), 0, math.radians(90)), 'RefSide')

    export(player, arm)
    if RENDER_PATH:
        render(RENDER_PATH)
    print(f'تم: {len(me.vertices)} نقطة، {len(me.polygons)} وجه، {len(arm.data.bones)} عظمة')


def export(player, arm):
    if GLB_PATH:
        for ob in bpy.context.scene.objects:
            ob.select_set(ob in (player, arm))
        bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format='GLB', use_selection=True)
    if FBX_PATH:
        # Mixamo يفضّل مجسماً بدون هيكل: يركّب هيكله الخاص ثم تحمّل منه الحركات
        for ob in bpy.context.scene.objects:
            ob.select_set(ob is player)
        bpy.ops.export_scene.fbx(filepath=FBX_PATH, use_selection=True, use_armature_deform_only=True,
                                 object_types={'MESH'}, use_mesh_modifiers=False)


def render(path):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 48
    try:
        sc.cycles.use_denoising = True
    except AttributeError:
        pass
    sc.render.resolution_x, sc.render.resolution_y = 1400, 800
    for vt in ('AgX', 'Filmic'):
        try:
            sc.view_settings.view_transform = vt
            break
        except TypeError:
            continue
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


build()
