import math, sys

def srgb_to_lin(c):
    c = c/255.0
    return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4

def lin_to_srgb(c):
    v = 12.92*c if c <= 0.0031308 else 1.055*(c**(1/2.4))-0.055
    return max(0.0, min(1.0, v))*255.0

def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2],16) for i in (0,2,4))

def rgb_oklch(r,g,b):
    lr,lg,lb = srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b)
    l = 0.4122214708*lr + 0.5363325363*lg + 0.0514459929*lb
    m = 0.2119034982*lr + 0.6806995451*lg + 0.1073969566*lb
    s = 0.0883024619*lr + 0.2817188376*lg + 0.6299787005*lb
    l_,m_,s_ = l**(1/3), m**(1/3), s**(1/3)
    L = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_
    a = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_
    bb= 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
    C = math.hypot(a,bb)
    H = math.degrees(math.atan2(bb,a)) % 360
    return L,C,H

def oklch_rgb(L,C,H):
    h = math.radians(H)
    a, bb = C*math.cos(h), C*math.sin(h)
    l_ = L + 0.3963377774*a + 0.2158037573*bb
    m_ = L - 0.1055613458*a - 0.0638541728*bb
    s_ = L - 0.0894841775*a - 1.2914855480*bb
    l,m,s = l_**3, m_**3, s_**3
    lr =  4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    lg = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    lb = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    return tuple(round(lin_to_srgb(c)) for c in (lr,lg,lb))

def lum(r,g,b):
    R,G,B = srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b)
    return 0.2126*R + 0.7152*G + 0.0722*B

def contrast(c1, c2):
    L1, L2 = lum(*c1), lum(*c2)
    hi, lo = max(L1,L2), min(L1,L2)
    return (hi+0.05)/(lo+0.05)
