import json
import sys
import time

from OCP.Bnd import Bnd_Box
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.IFSelect import IFSelect_RetDone
from OCP.Quantity import Quantity_Color
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.collections import Sequence_TDF_Label as TDF_LabelSequence
from OCP.TDF import TDF_Label
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.XCAFDoc import XCAFDoc_ColorGen, XCAFDoc_ColorSurf, XCAFDoc_DocumentTool


def tel(form, slag):
    n = 0
    e = TopExp_Explorer(form, slag)
    while e.More():
        n += 1
        e.Next()
    return n


def namn(merke):
    a = TDataStd_Name()
    if merke.FindAttribute(TDataStd_Name.GetID_s(), a):
        return TCollection_ExtendedString(a.Get()).ToExtString()
    return ""


def volum(form):
    g = GProp_GProps()
    BRepGProp.VolumeProperties_s(form, g)
    return g.Mass()


def boks(form):
    b = Bnd_Box()
    b.SetGap(0)
    BRepBndLib.AddOptimal_s(form, b, False, False)
    lo = b.CornerMin()
    hi = b.CornerMax()
    return [lo.X(), lo.Y(), lo.Z()], [hi.X(), hi.Y(), hi.Z()]


def farge(verkty, merke, form):
    c = Quantity_Color()
    srgb = lambda x: 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    hex_ = lambda: "#%02x%02x%02x" % tuple(round(srgb(x) * 255) for x in (c.Red(), c.Green(), c.Blue()))
    for slag in (XCAFDoc_ColorSurf, XCAFDoc_ColorGen):
        try:
            if verkty.GetColor_s(merke, slag, c):
                return hex_()
        except TypeError:
            pass
    e = TopExp_Explorer(form, TopAbs_SOLID)
    while e.More():
        for kandidat in (e.Current(), e.Current().Located(TopLoc_Location())):
            for slag in (XCAFDoc_ColorSurf, XCAFDoc_ColorGen):
                if verkty.GetColor(kandidat, slag, c):
                    return hex_()
        e.Next()
    return ""


sti = sys.argv[1]
venta = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
t0 = time.time()
dok = TDocStd_Document(TCollection_ExtendedString("XmlOcaf"))
lesar = STEPCAFControl_Reader()
lesar.SetNameMode(True)
lesar.SetColorMode(True)
if lesar.ReadFile(sti) != IFSelect_RetDone:
    print("FEIL: kan ikkje lese", sti)
    sys.exit(1)
lesar.Transfer(dok)
les = time.time() - t0
former = XCAFDoc_DocumentTool.ShapeTool_s(dok.Main())
fargar = XCAFDoc_DocumentTool.ColorTool_s(dok.Main())
frie = TDF_LabelSequence()
former.GetFreeShapes(frie)
delar = []
for i in range(1, frie.Length() + 1):
    rot = frie.Value(i)
    born = TDF_LabelSequence()
    former.GetComponents_s(rot, born, False)
    if born.Length() == 0:
        delar.append((namn(rot), rot, rot, former.GetShape_s(rot)))
    for j in range(1, born.Length() + 1):
        b = born.Value(j)
        vist = TDF_Label()
        former.GetReferredShape_s(b, vist)
        delar.append((namn(vist) or namn(b), b, vist, former.GetShape_s(b)))
sum_v = 0.0
boygde = []
verst_v = 0.0
verst_b = 0.0
feil = 0
solid = 0
flater = 0
gyldig = 0
med_farge = 0
for n, b, vist, form in delar:
    v = volum(form)
    sum_v += v
    solid += tel(form, TopAbs_SOLID)
    flater += tel(form, TopAbs_FACE)
    gyldig += 1 if BRepCheck_Analyzer(form).IsValid() else 0
    f = farge(fargar, vist, form)
    med_farge += 1 if f else 0
    if venta:
        d = next((x for x in venta["delar"] if x["namn"] == n), None)
        if d is None:
            feil += 1
            print("ukjend del", repr(n))
            continue
        mi, ma = boks(form)
        avvik_b = max(max(abs(mi[k] - d["min"][k]) for k in range(3)), max(abs(ma[k] - d["max"][k]) for k in range(3)))
        if d.get("tilnaerma"):
            boygde.append("%s volum %+.2f %% boks %.3f mm" % (n, 100 * (v - d["volum"]) / d["volum"], avvik_b))
            continue
        verst_v = max(verst_v, abs(v - d["volum"]))
        verst_b = max(verst_b, avvik_b)
    if "--liste" in sys.argv:
        print(n, f, "vol=%.3f" % v)
print("les %.1f s · %d delar · %d solid · %d flater · %d gyldige · %d med farge" % (les, len(delar), solid, flater, gyldig, med_farge))
print("namn:", " ".join(n for n, *_ in delar))
if venta:
    print("volum %.3f mm3 · venta %.3f mm3 · avvik %.6f" % (sum_v, venta["sumVolum"], sum_v - venta["sumVolum"]))
    print("verste del: volum %.6f mm3 · boks %.6f mm · ukjende namn %d" % (verst_v, verst_b, feil))
    if boygde:
        print("boygde (strimlar, tilnaerma): " + " | ".join(boygde))
else:
    print("volum %.3f mm3" % sum_v)
if "--overlapp" in sys.argv:
    t1 = time.time()
    boksar = [boks(form) for _, _, _, form in delar]
    funn = []
    par = 0
    for i in range(len(delar)):
        for j in range(i + 1, len(delar)):
            (a0, a1), (b0, b1) = boksar[i], boksar[j]
            if any(a0[k] > b1[k] or b0[k] > a1[k] for k in range(3)):
                continue
            par += 1
            felles = BRepAlgoAPI_Common(delar[i][3], delar[j][3])
            if not felles.IsDone():
                continue
            v = volum(felles.Shape())
            if v > 1e-6:
                lo, hi = boks(felles.Shape())
                funn.append((v, delar[i][0], delar[j][0], lo, hi))
    funn.sort(reverse=True)
    print("overlapp %.1f s · %d par testa · %d med volum · sum %.3f mm3 · størst %.3f mm3" % (time.time() - t1, par, len(funn), sum(f[0] for f in funn), funn[0][0] if funn else 0))
    for v, a, b, lo, hi in funn[:4]:
        print("  %s x %s: %.3f mm3 i boks %s .. %s" % (a, b, v, " ".join("%.2f" % x for x in lo), " ".join("%.2f" % x for x in hi)))
