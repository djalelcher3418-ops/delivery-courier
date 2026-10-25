"""تحسين وجه لاعب «حلم الملاعب» — سكربت Blender

يبني رأساً مفصّلاً بدل الرأس البسيط: عظم الحاجب، تجويف العينين، الوجنتان، الأنف (الجسر والأرنبة
وفتحتا الأنف)، الشفتان، الفك والذقن، عينان حقيقيتان (بياض وقزحية وبؤبؤ وجفنان ورموش)، حاجبان،
أذنان، وشعر مسرّح للخلف بخط شعر طبيعي وكعكة.

الاستعمال:
  1) شغّل player_character.py أولاً، ثم شغّل هذا السكربت: يستبدل رأس الشخصية بالرأس الجديد
     ويربطه بعظمة الرأس في الهيكل.
  2) أو شغّله وحده في مشهد فارغ: يبني الرأس فقط مع كاميرا قريبة لتجربة ملامح الوجه بسرعة.

من الطرفية (الشخصية ثم الوجه):
  blender -b -P player_character.py -P player_face.py -- --glb player.glb --face-render face.png

ملامح الوجه كلها في قاموس FACE أسفله: غيّر الأرقام (بالمتر) ثم أعد التشغيل.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

# ---------------- ملامح الوجه (بالمتر؛ الوجه نحو -Y) ----------------
FACE = {
    'head_radius': (0.078, 0.097, 0.118),   # نصف العرض، نصف العمق، نصف الارتفاع
    'jaw_narrow': 0.2,        # ضيق الفك نحو الذقن (0 = بلا ضيق)
    'face_flat': 0.07,        # تسطيح مقدمة الوجه
    'jaw_angle': 0.006,       # بروز زاوية الفك (فك واضح مثل صورة المرجع)
    'chin': 0.012,            # بروز الذقن للأمام
    'eye_x': 0.031,           # بعد كل عين عن المنتصف
    'eye_z': 0.012,           # ارتفاع العينين عن مركز الرأس
    'eye_radius': 0.0118,
    'eye_width': 0.95,        # اتساع فتحة العين (زاوية على كرة العين)
    'eye_height': 0.34,       # ارتفاع فتحة العين (زاوية)
    'eye_tilt': 0.1,          # ميل الزاوية الخارجية للعين للأعلى
    'socket_depth': 0.009,
    'brow_ridge': 0.0035,
    'cheekbone': 0.0045,
    'nose_length': 0.06,      # من أعلى الجسر إلى الأرنبة
    'nose_height': 0.011,     # بروز الأرنبة
    'nose_width': 0.0145,     # عرض فتحتي الأنف
    'mouth_z': -0.057,
    'mouth_width': 0.023,
    'lip_upper': 0.0045,
    'lip_lower': 0.0052,
    'hair_thickness': 0.006,
}
SKIN = (0.74, 0.55, 0.42)
LIPS = (0.66, 0.43, 0.36)
HAIR = (0.045, 0.035, 0.03)
BROW = (0.12, 0.085, 0.07)
IRIS = (0.23, 0.14, 0.08)
SCLERA = (0.92, 0.9, 0.86)
RES = (160, 120)               # دقة الرأس: (حول الرأس، من الأعلى للأسفل)
FACE_RENDER = ""               # صورة معاينة قريبة للوجه (اختياري)


def parse_args():
    global FACE_RENDER
    if '--' in sys.argv:
        a = sys.argv[sys.argv.index('--') + 1:]
        if '--face-render' in a:
            FACE_RENDER = a[a.index('--face-render') + 1]


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def g2(dx, dz, sx, sz):
    return math.exp(-(dx * dx) / (2 * sx * sx) - (dz * dz) / (2 * sz * sz))


def srgb(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ---------------- المواد ----------------
def set_in(node, names, v):
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = v
            return


def material(name, color, rough, sss=0.0, bump=None, coat=0.0):
    """bump: ('noise', قوة، مقياس) لمسام البشرة، أو ('wave', قوة، مقياس) لخصلات الشعر المسرّح."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    set_in(bsdf, ['Base Color'], (*srgb(color), 1))
    set_in(bsdf, ['Roughness'], rough)
    if sss:
        set_in(bsdf, ['Subsurface Weight', 'Subsurface'], sss)
        set_in(bsdf, ['Subsurface Radius'], (0.9, 0.45, 0.25))
        set_in(bsdf, ['Subsurface Scale'], 0.008)
    if coat:
        set_in(bsdf, ['Coat Weight', 'Clearcoat'], coat)
    if bump:
        kind, strength, scale = bump
        tex = nt.nodes.new('ShaderNodeTexNoise' if kind == 'noise' else 'ShaderNodeTexWave')
        tex.inputs['Scale'].default_value = scale
        if kind == 'wave':
            tex.wave_type = 'BANDS'
            tex.bands_direction = 'Y'   # خصلات باتجاه الخلف
            tex.inputs['Distortion'].default_value = 4
            tex.inputs['Detail'].default_value = 3
        coord = nt.nodes.new('ShaderNodeTexCoord')
        nt.links.new(coord.outputs['Object'], tex.inputs['Vector'])
        bn = nt.nodes.new('ShaderNodeBump')
        bn.inputs['Strength'].default_value = strength
        bn.inputs['Distance'].default_value = 0.002
        nt.links.new(tex.outputs['Fac'] if 'Fac' in tex.outputs else tex.outputs[0], bn.inputs['Height'])
        nt.links.new(bn.outputs['Normal'], bsdf.inputs['Normal'])
    m.diffuse_color = (*srgb(color), 1)
    return m


def skin_material():
    """بشرة بمسام خفيفة، يُمزج فيها لون الشفتين والحاجبين من قناع FaceMask (حواف ناعمة بلا تسنين)."""
    m = material('Skin', SKIN, 0.42, sss=0.15, bump=('noise', 0.08, 900))
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'FaceMask'
    sep = nt.nodes.new('ShaderNodeSeparateColor') if hasattr(bpy.types, 'ShaderNodeSeparateColor') else nt.nodes.new('ShaderNodeSeparateRGB')
    nt.links.new(attr.outputs['Color'], sep.inputs[0])

    def mix(a, b, fac):
        try:
            n = nt.nodes.new('ShaderNodeMix')
            n.data_type = 'RGBA'
            ins = [i for i in n.inputs if i.type == 'RGBA']
            out = next(o for o in n.outputs if o.type == 'RGBA')
            fac_in = n.inputs[0]
        except RuntimeError:
            n = nt.nodes.new('ShaderNodeMixRGB')
            ins, out, fac_in = [n.inputs[1], n.inputs[2]], n.outputs[0], n.inputs[0]
        for sock, val in ((ins[0], a), (ins[1], b)):
            if isinstance(val, tuple):
                sock.default_value = (*srgb(val), 1)
            else:
                nt.links.new(val, sock)
        nt.links.new(fac, fac_in)
        return out

    c1 = mix(SKIN, LIPS, sep.outputs[0])
    c2 = mix(c1, BROW, sep.outputs[1])
    nt.links.new(c2, bsdf.inputs['Base Color'])
    return m


def write_masks(me, masks_by_index):
    attr = me.color_attributes.get('FaceMask') or me.color_attributes.new('FaceMask', 'FLOAT_COLOR', 'POINT')
    data = [0.0] * (len(me.vertices) * 4)
    for i in range(len(me.vertices)):
        data[i * 4 + 3] = 1.0
    for i, (lips, brow) in masks_by_index.items():
        data[i * 4] = lips
        data[i * 4 + 1] = brow
    attr.data.foreach_set('color', data)


# ---------------- شكل الرأس ----------------
def shape_head(x, y, z, socket=True):
    """يحوّل نقطة على كرة بيضاوية إلى سطح وجه بشري. الإحداثيات نسبة لمركز الرأس."""
    F = FACE
    RX, RY, RZ = F['head_radius']
    front = max(0.0, -y / RY)
    t_low = max(0.0, -z / RZ)
    # جمجمة: قمة أقل تكوّراً، ومؤخرة أعرض قليلاً
    if z > 0:
        z *= 1 - 0.05 * (z / RZ) ** 2
    if y > 0:
        y *= 1 + 0.04 * max(0.0, z / RZ + 0.3)
    # تسطيح الوجه وضيق الفك نحو الذقن
    if y < 0:
        y *= 1 - F['face_flat'] * front ** 1.5 * (1 - min(1.0, (x / RX) ** 2))
    x *= 1 - F['jaw_narrow'] * t_low ** 1.6
    if y > 0 and z < 0:
        y *= 1 - 0.28 * t_low   # أسفل الجمجمة من الخلف يتجه نحو الرقبة
    p = Vector((x, y, z))
    n = p.normalized()
    fw = smooth(0.35, 0.7, front)            # الملامح الأمامية فقط على الوجه
    fwd = 0.0   # إزاحة للأمام (-Y)
    out = 0.0   # إزاحة على امتداد السطح للخارج
    ex, ez = F['eye_x'], F['eye_z']
    for s in (1, -1):
        if socket:
            out -= F['socket_depth'] * g2(x - s * ex, z - ez, 0.02, 0.012) * fw       # تجويف العين
        fwd += F['brow_ridge'] * g2(x - s * 0.03, z - 0.033, 0.022, 0.008) * fw        # عظم الحاجب
        out += F['cheekbone'] * g2(x - s * 0.052, z + 0.012, 0.016, 0.013)             # الوجنة
        out -= 0.003 * g2(x - s * 0.046, z + 0.045, 0.014, 0.014) * fw                 # تحت الوجنة
        out -= 0.004 * g2(x - s * RX * 0.93, z - 0.03, 0.012, 0.016) * smooth(0.1, 0.5, front)  # الصدغ
        out += F['jaw_angle'] * g2(x - s * 0.066, z + 0.075, 0.014, 0.016) * smooth(-0.3, 0.2, front)  # زاوية الفك
        fwd += 0.008 * g2(x - s * F['nose_width'] * 0.93, z + 0.031, 0.006, 0.006) * fw  # جناحا الأنف
        fwd -= 0.004 * g2(x - s * 0.007, z + 0.037, 0.0035, 0.0025) * fw               # فتحتا الأنف
        fwd -= 0.002 * g2(x - s * F['mouth_width'], z - F['mouth_z'], 0.004, 0.004) * fw  # زاويتا الفم
        fwd += 0.003 * g2(x - s * 0.012, z + 0.093, 0.009, 0.01) * fw                  # ذقن مربّع
    fwd += 0.002 * g2(x, z - 0.03, 0.008, 0.01) * fw                                   # بين الحاجبين
    # الأنف: جسر يبرز تدريجياً حتى الأرنبة ثم ينحدر تحتها
    top, tip = 0.033, 0.033 - F['nose_length']
    if tip - 0.013 < z < top:
        t = (top - z) / (top - tip) if z > tip else 1.0
        h = 0.003 + F['nose_height'] * min(1.0, t) ** 1.4
        if z < tip:
            h *= max(0.0, 1 - (tip - z) / 0.013)
        w = 0.0065 + 0.008 * min(1.0, t) ** 2
        fwd += h * math.exp(-(x * x) / (2 * w * w)) * fw
    fwd += 0.004 * g2(x, z - tip - 0.003, 0.009, 0.007) * fw                           # أرنبة مستديرة
    mz = F['mouth_z']
    fwd += 0.0015 * g2(x, z - mz - 0.011, 0.005, 0.006) * fw                           # ما فوق الشفة
    fwd += F['lip_upper'] * g2(x, z - mz - 0.005, 0.017, 0.0045) * fw                  # الشفة العليا
    fwd -= 0.003 * g2(x, z - mz, 0.022, 0.0018) * fw                                   # خط الفم
    fwd += F['lip_lower'] * g2(x, z - mz + 0.0055, 0.015, 0.005) * fw                  # الشفة السفلى
    fwd -= 0.003 * g2(x, z - mz + 0.016, 0.018, 0.005) * fw                            # تحت الشفة
    fwd += F['chin'] * g2(x, z + 0.09, 0.02, 0.012) * fw                               # الذقن
    fwd += 0.011 * g2(x, z + 0.055, 0.03, 0.026) * fw                                  # بروز منطقة الفم (الفك العلوي)
    fwd += 0.007 * g2(x, z - 0.065, 0.045, 0.03) * fw                                  # جبهة أقل انحداراً
    fwd += 0.004 * g2(x, z + 0.005, 0.035, 0.03) * fw                                  # امتلاء الوجه بين العينين والفم
    return p + n * out + Vector((0, -fwd, 0))


def face_masks(co):
    """قناع ناعم لكل نقطة من سطح الرأس: (الشفتان، الحاجبان) من 0 إلى 1، تمزجه مادة البشرة."""
    x, y, z = co
    if y > -0.05:
        return (0.0, 0.0)
    e = (x / FACE['mouth_width']) ** 2 + ((z - FACE['mouth_z']) / 0.0105) ** 2
    lips = 1 - smooth(0.65, 1.15, e)
    ax = abs(x)
    t = max(0.0, min(1.0, (ax - 0.011) / 0.042))
    zc = 0.031 + 0.006 * math.sin(t * math.pi * 0.85) - 0.004 * t
    w = 0.0034 * (1 - 0.55 * t) + 0.0012
    brow = (1 - smooth(w * 0.55, w * 1.25, abs(z - zc))) * smooth(0.007, 0.012, ax) * (1 - smooth(0.05, 0.057, ax))
    return (lips, brow)


def hairline_z(x, y):
    """ارتفاع خط الشعر حسب الزاوية حول الرأس (0 = الجبهة، π = القفا)."""
    phi = abs(math.atan2(x, -y))
    pts = [(0, 0.058), (0.55, 0.055), (0.95, 0.04), (1.3, 0.033), (1.62, 0.03), (1.95, -0.01), (2.4, -0.056), (3.15, -0.076)]
    for (a0, z0), (a1, z1) in zip(pts, pts[1:]):
        if phi <= a1:
            t = (phi - a0) / (a1 - a0)
            return z0 + (z1 - z0) * (t * t * (3 - 2 * t))
    return pts[-1][1]


# ---------------- بناء الرأس ----------------
def build_head(center, S, mats):
    """يعيد bmesh فيه الرأس والرقبة والعينان والجفنان والحاجبان والأذنان والشعر، ومجموعة نقاط الرقبة."""
    bm = bmesh.new()
    C = Vector(center)
    RX, RY, RZ = FACE['head_radius']
    M = {name: i for i, name in enumerate(mats)}

    # 1) سطح الرأس
    ret = bmesh.ops.create_uvsphere(bm, u_segments=RES[0], v_segments=RES[1], radius=1.0)
    head_verts = ret['verts']
    for v in head_verts:
        v.co = shape_head(v.co.x * RX, v.co.y * RY, v.co.z * RZ)
    head_faces = list({f for v in head_verts for f in v.link_faces})
    for f in head_faces:
        f.material_index = M['Skin']   # لون الشفتين من القناع في مادة البشرة
        f.smooth = True
    bm.normal_update()

    # سطح الوجه عند نقطة (x, z) من الأمام، محسوباً من معادلة الشكل نفسها (بلا قفزات بين النقاط)
    def surface(x, z, socket=True):
        y = -RY * math.sqrt(max(0.02, 1 - (x / RX) ** 2 - (z / RZ) ** 2))
        p = shape_head(x, y, z, socket)
        e = 0.0015
        px = shape_head(x + e, -RY * math.sqrt(max(0.02, 1 - ((x + e) / RX) ** 2 - (z / RZ) ** 2)), z, socket)
        pz = shape_head(x, -RY * math.sqrt(max(0.02, 1 - (x / RX) ** 2 - ((z + e) / RZ) ** 2)), z + e, socket)
        n = (pz - p).cross(px - p).normalized()
        return p, (n if n.y < 0 else -n)

    # 2) العينان والجفنان
    er = FACE['eye_radius']
    for s in (1, -1):
        p, _ = surface(s * FACE['eye_x'], FACE['eye_z'], socket=False)
        ec = Vector((p.x, p.y + er + 0.0025, p.z))  # مقدمة العين خلف سطح الوجه الطبيعي بقليل، تحت عظم الحاجب
        rot = Matrix.Rotation(math.radians(90), 4, 'X')  # قطب الكرة نحو الأمام (-Y)
        ret = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=24, radius=er)
        bmesh.ops.transform(bm, matrix=rot, verts=ret['verts'])
        for v in ret['verts']:
            ang = Vector((0, -1, 0)).angle(v.co.normalized())
            if ang < 0.5:
                v.co *= 1 + 0.05 * (1 - ang / 0.5)   # القرنية تبرز قليلاً فتلمع
            v.co += ec
        for f in {f for v in ret['verts'] for f in v.link_faces}:
            ang = Vector((0, -1, 0)).angle((f.calc_center_median() - ec).normalized())
            f.material_index = M['Pupil'] if ang < 0.2 else M['Iris'] if ang < 0.5 else M['Sclera']
            f.smooth = True
        # الجفنان: قشرة جلد حول العين مع فتحة لوزية الشكل، وخط رموش داكن على حافتها
        ret = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=er + 0.0009)
        bmesh.ops.transform(bm, matrix=rot, verts=ret['verts'])
        lid_v = ret['verts']

        def lid_metric(co):
            fwdd = max(1e-6, -co.y)
            a = math.atan2(co.x * s, fwdd)        # أفقي: موجب نحو الزاوية الخارجية
            b = math.atan2(co.z, fwdd) - FACE['eye_tilt'] * a
            hb = FACE['eye_height'] if b > 0 else FACE['eye_height'] * 0.72
            return (a / FACE['eye_width']) ** 2 + (b / hb) ** 2, Vector((0, -1, 0)).angle(co.normalized())

        kill = []
        for v in lid_v:
            m, ang = lid_metric(v.co)
            if ang > 1.35 or (m < 1 and ang < 1.25):
                kill.append(v)
        lid_faces = list({f for v in lid_v for f in v.link_faces})
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        for v in lid_v:
            if v.is_valid:
                v.co += ec
        for f in lid_faces:
            if not f.is_valid:
                continue
            m, _ = lid_metric(f.calc_center_median() - ec)
            upper = (f.calc_center_median() - ec).z > 0
            f.material_index = M['Lash'] if (m < 1.35 and upper) else M['Skin']
            f.smooth = True

    # 4) الأذنان: صيوان مسطح بتجويف داخلي، مائل للخلف وبارز قليلاً
    for s in (1, -1):
        ret = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=18, radius=1.0)
        for v in ret['verts']:
            lx, ly, lz = v.co.x * 0.006, v.co.y * 0.017, v.co.z * 0.03
            if lx > 0:   # الوجه الخارجي للأذن: تجويف (الصدفة) في الوسط
                lx -= 0.004 * g2(ly + 0.002, lz + 0.004, 0.007, 0.011)
            v.co = Vector((lx * s, ly, lz))
        m = (Matrix.Translation(Vector((s * (RX - 0.002), 0.01, -0.004))) @
             Matrix.Rotation(-0.25 * s, 4, 'Z') @ Matrix.Rotation(0.2, 4, 'X'))
        bmesh.ops.transform(bm, matrix=m, verts=ret['verts'])
        for f in {f for v in ret['verts'] for f in v.link_faces}:
            f.material_index = M['Skin']
            f.smooth = True

    # 5) الشعر: قشرة فوق الرأس من خط الشعر، أسمك في الأعلى ويرقّ عند الحافة
    # عند خط الشعر تنزل القشرة قليلاً تحت الجلد، فيظهر الحد خطاً ناعماً حيث تتقاطع معه
    hv = {}
    for v in head_verts:
        hz = hairline_z(v.co.x, v.co.y)
        if v.co.z > hz - 0.012:
            k = max(-0.35, min(1.0, (v.co.z - hz) / 0.014))
            th = FACE['hair_thickness'] * (0.55 + 0.45 * smooth(-0.05, 0.1, v.co.z)) * k
            hv[v] = bm.verts.new(v.co + v.normal * (0.0004 + th))
    for f in head_faces:
        if all(v in hv for v in f.verts):
            nf = bm.faces.new([hv[v] for v in f.verts])
            nf.material_index = M['Hair']
            nf.smooth = True
    # الكعكة وربطة الشعر
    bun_c = Vector((0, 0.045, RZ * 0.93))
    ret = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1.0)
    for v in ret['verts']:
        v.co = Vector((v.co.x * 0.032, v.co.y * 0.034, v.co.z * 0.028)) + bun_c + Vector((0, 0, 0.022))
    for f in {f for v in ret['verts'] for f in v.link_faces}:
        f.material_index = M['Hair']
        f.smooth = True
    ret = bmesh.ops.create_cone(bm, cap_ends=False, segments=24, radius1=0.019, radius2=0.017, depth=0.008)
    bmesh.ops.translate(bm, verts=ret['verts'], vec=bun_c + Vector((0, 0, 0.002)))
    for f in {f for v in ret['verts'] for f in v.link_faces}:
        f.material_index = M['Lash']

    # 6) الرقبة: أنبوب يدخل في الرأس من الأعلى وفي رقبة الجسم من الأسفل
    # الطرف السفلي مخفي داخل رقبة الجسم، والجزء العلوي يغلّفها حتى الفك
    neck = set()
    rings = []
    profile = [(-0.178, 0.062), (-0.16, 0.069), (-0.142, 0.074), (-0.115, 0.071), (-0.085, 0.066), (-0.05, 0.06)]
    for i, (z, r) in enumerate(profile):
        yc = 0.012 + 0.008 * i / (len(profile) - 1)
        ring = [bm.verts.new((math.cos(a) * r, yc + math.sin(a) * r * 0.97, z)) for a in (k / 40 * 2 * math.pi for k in range(40))]
        neck.update(ring)
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(40):
            f = bm.faces.new((r0[k], r0[(k + 1) % 40], r1[(k + 1) % 40], r1[k]))
            f.material_index = M['Skin']
            f.smooth = True

    # القناع يُحسب بإحداثيات الرأس المحلية، قبل النقل إلى مكانه
    masks = {v: face_masks(v.co) for v in head_verts if v.is_valid}
    # كل شيء إلى مكانه وحجمه
    bmesh.ops.scale(bm, vec=(S, S, S), verts=bm.verts)
    bmesh.ops.translate(bm, vec=C, verts=bm.verts)
    bm.normal_update()
    return bm, neck, masks


# ---------------- تركيب الرأس على الشخصية ----------------
MAT_ORDER = ['Skin', 'Lips', 'Hair', 'Sclera', 'Iris', 'Pupil', 'Lash']


def make_mats():
    return {
        'Skin': skin_material(),
        'Lips': material('Lips', LIPS, 0.32, sss=0.2),
        'Hair': material('Hair', HAIR, 0.5, bump=('wave', 0.12, 260)),
        'Sclera': material('Sclera', SCLERA, 0.08, coat=0.5),
        'Iris': material('Iris', IRIS, 0.08, coat=0.8),
        'Pupil': material('Pupil', (0.01, 0.01, 0.01), 0.05, coat=0.8),
        'Lash': material('Lash', (0.02, 0.016, 0.014), 0.6),
    }


def attach(player, mats):
    S = player.get('scale', 1.0)
    floor_z = player.get('floor_z', 0.0)
    hc = Vector(player.get('head_center', (0, 0.006, 1.665)))
    center = hc * S + Vector((0, 0, floor_z))

    # المواد في المجسم: نضيف الناقص ونحسب أرقامها
    names = [m.name for m in player.data.materials]
    for n in MAT_ORDER:
        if mats[n].name not in names:
            player.data.materials.append(mats[n])
            names.append(mats[n].name)
    idx = [names.index(mats[n].name) for n in MAT_ORDER]

    bm = bmesh.new()
    bm.from_mesh(player.data)
    deform = bm.verts.layers.deform.verify()
    # حذف الرأس القديم وشعره وعينيه، وأعلى الرقبة القديمة
    def is_old(co):
        d = (co - center) / S
        # الرقبة القديمة تبقى كاملة، والرقبة الجديدة تغلّفها من الخارج فلا تظهر فجوة
        if d.z > -0.122 and (d.x / 0.095) ** 2 + (d.y / 0.115) ** 2 + (d.z / 0.135) ** 2 < 1:
            return True                                   # الرأس القديم كله مع الذقن
        return d.z > 0.05 and math.hypot(d.x, d.y) < 0.14  # الشعر والكعكة القديمان

    old = [v for v in bm.verts if is_old(v.co)]
    bmesh.ops.delete(bm, geom=old, context='VERTS')

    head_bm, neck, masks = build_head(center, S, MAT_ORDER)
    # الرقبة الجديدة تلتف على سطح رقبة الجسم: أسفلها يغوص تحته بقليل وأعلاها يتصل بالرأس، فلا يظهر خط التقاء
    tree = BVHTree.FromBMesh(bm)
    for v in neck:
        h = (v.co.z - center.z) / S
        wrap = 1 - smooth(-0.125, -0.095, h)
        if wrap <= 0:
            continue
        loc, nrm, _, _ = tree.find_nearest(v.co)
        if loc is None:
            continue
        off = (-0.003 + 0.0055 * smooth(-0.175, -0.158, h)) * S
        v.co = v.co.lerp(loc + nrm * off, wrap)
    # نقل الرأس الجديد إلى مجسم الشخصية مع أوزانه
    g_head = player.vertex_groups['Head'].index
    g_neck = player.vertex_groups['Neck'].index
    vmap = {}
    for v in head_bm.verts:
        nv = bm.verts.new(v.co)
        if v in neck:
            k = smooth(center.z - 0.17 * S, center.z - 0.09 * S, v.co.z)
            nv[deform][g_head] = k
            if k < 1:
                nv[deform][g_neck] = 1 - k
        else:
            nv[deform][g_head] = 1.0
        vmap[v] = nv
    for f in head_bm.faces:
        nf = bm.faces.new([vmap[v] for v in f.verts])
        nf.material_index = idx[f.material_index]
        nf.smooth = True
    bm.verts.index_update()
    masks_by_index = {vmap[v].index: m for v, m in masks.items()}
    head_bm.free()
    bm.to_mesh(player.data)
    bm.free()
    write_masks(player.data, masks_by_index)
    player.data.update()


def standalone(mats):
    """بدون شخصية: الرأس وحده في مشهد صغير مع كاميرا وإضاءة، لتجربة الملامح بسرعة."""
    me = bpy.data.meshes.new('Head')
    bm, _, masks = build_head((0, 0, 1.665), 1.0, MAT_ORDER)
    bm.verts.index_update()
    by_index = {v.index: m for v, m in masks.items()}
    bm.to_mesh(me)
    bm.free()
    write_masks(me, by_index)
    for n in MAT_ORDER:
        me.materials.append(mats[n])
    bpy.context.scene.collection.objects.link(bpy.data.objects.new('Head', me))


def face_camera_and_render(path, center):
    sc = bpy.context.scene
    if not any(o.type == 'LIGHT' for o in sc.objects):
        for loc, e in (((-1.2, -1.6, 2.2), 120), ((1.4, -1.2, 1.9), 60), ((0, 1.5, 2.2), 80)):
            ld = bpy.data.lights.new('FaceLight', 'AREA')
            ld.energy, ld.size = e, 1.0
            lo = bpy.data.objects.new('FaceLight', ld)
            lo.location = loc
            lo.rotation_euler = (Vector(center) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
            sc.collection.objects.link(lo)
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    cam_data = bpy.data.cameras.new('FaceCam')
    cam_data.lens = 85
    cam = bpy.data.objects.new('FaceCam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 48
    try:
        sc.cycles.use_denoising = True
    except AttributeError:
        pass
    for vt in ('AgX', 'Filmic'):
        try:
            sc.view_settings.view_transform = vt
            break
        except TypeError:
            continue
    sc.render.resolution_x, sc.render.resolution_y = 900, 900
    c = Vector(center)
    base = path.rsplit('.', 1)[0]
    for name, ang in (('front', 0), ('three_quarter', 35), ('side', 90)):
        a = math.radians(ang)
        cam.location = c + Vector((math.sin(a) * 0.9, -math.cos(a) * 0.9, 0.02))
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{base}_{name}.png'
        bpy.ops.render.render(write_still=True)


def main():
    parse_args()
    mats = make_mats()
    player = bpy.data.objects.get('Player')
    if player is not None and 'Head' in player.vertex_groups:
        attach(player, mats)
        S = player.get('scale', 1.0)
        center = Vector(player.get('head_center', (0, 0.006, 1.665))) * S + Vector((0, 0, player.get('floor_z', 0.0)))
        print('تم تحسين وجه الشخصية', len(player.data.vertices), 'نقطة')
    else:
        standalone(mats)
        center = Vector((0, 0, 1.665))
        print('تم بناء الرأس وحده (لا توجد شخصية في المشهد)')
    if FACE_RENDER:
        face_camera_and_render(FACE_RENDER, center)


main()
