"""
Generates WL_Playstore_Presentation.pptx with custom vector illustrations
for every slide (drawn programmatically with matplotlib, since no AI
image-generation tool is available in this environment).

Run:
    python docs/generate_ppt.py
"""
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import (
    Circle, Ellipse, FancyBboxPatch, Polygon, Rectangle, Arc, Wedge
)

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "ppt_assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

# ── Color palette ──────────────────────────────────────────────────────────
NAVY = "#0B1F3A"
NAVY2 = "#142b52"
BLUE = "#2E6BE6"
TEAL = "#1FB87A"
AMBER = "#F2A33C"
RED = "#E6543A"
LIGHT = "#EAF1FB"
WHITE = "#FFFFFF"
GRAY = "#8CA3C7"
DARKGRAY = "#4A5C7A"

PPTX_NAVY = RGBColor(0x0B, 0x1F, 0x3A)
PPTX_BLUE = RGBColor(0x2E, 0x6B, 0xE6)
PPTX_TEAL = RGBColor(0x1F, 0xB8, 0x7A)
PPTX_AMBER = RGBColor(0xF2, 0xA3, 0x3C)
PPTX_WHITE = RGBColor(0xFF, 0xFF, 0xFF)
PPTX_DARK = RGBColor(0x1A, 0x1A, 0x2E)
PPTX_GRAY = RGBColor(0x55, 0x55, 0x66)


# ── Icon helper library (matplotlib) ───────────────────────────────────────
def new_canvas(w=7.0, h=6.0, bg=None):
    fig, ax = plt.subplots(figsize=(w, h), dpi=150)
    ax.set_xlim(0, w * 2)
    ax.set_ylim(0, h * 2)
    ax.set_aspect("equal")
    ax.axis("off")
    if bg:
        fig.patch.set_facecolor(bg)
        ax.set_facecolor(bg)
    return fig, ax


def save(fig, name):
    path = os.path.join(ASSETS_DIR, name)
    fig.savefig(path, bbox_inches="tight", pad_inches=0.15, transparent=False)
    plt.close(fig)
    return path


def box(ax, x, y, w, h, text, color=BLUE, textcolor="white", fontsize=11, rounding=0.12):
    rect = FancyBboxPatch(
        (x - w / 2, y - h / 2), w, h,
        boxstyle=f"round,pad=0.02,rounding_size={rounding}",
        linewidth=0, facecolor=color, zorder=3,
    )
    ax.add_patch(rect)
    # Auto-shrink font size so the longest line fits inside the box width.
    # Canvas convention: figure width is always 7in with xlim spanning 14
    # data units -> 1 data unit == 36pt.
    longest_line = max(text.split("\n"), key=len)
    max_fit = 47.0 * w / max(len(longest_line), 1)
    eff_fontsize = max(7.0, min(fontsize, max_fit))
    ax.text(x, y, text, ha="center", va="center", color=textcolor,
             fontsize=eff_fontsize, fontweight="bold", zorder=4)


def arrow(ax, p1, p2, color=GRAY, lw=2.2, style="-|>"):
    ax.annotate("", xy=p2, xytext=p1,
                arrowprops=dict(arrowstyle=style, color=color, lw=lw,
                                 shrinkA=2, shrinkB=2))


def cloud(ax, x, y, s=1.0, color=BLUE):
    for cx, cy, r in [(x - 0.5*s, y, 0.42*s), (x - 0.12*s, y + 0.25*s, 0.55*s),
                       (x + 0.38*s, y + 0.05*s, 0.48*s), (x + 0.05*s, y - 0.18*s, 0.5*s)]:
        ax.add_patch(Circle((cx, cy), r, color=color, ec="none", zorder=3))


def shield(ax, x, y, s=1.0, color=TEAL, check=True):
    pts = [(x - 0.5*s, y + 0.4*s), (x, y + 0.62*s), (x + 0.5*s, y + 0.4*s),
           (x + 0.5*s, y - 0.15*s), (x, y - 0.62*s), (x - 0.5*s, y - 0.15*s)]
    ax.add_patch(Polygon(pts, closed=True, color=color, zorder=3))
    if check:
        ax.plot([x - 0.22*s, x - 0.02*s, x + 0.3*s],
                 [y - 0.02*s, y - 0.25*s, y + 0.25*s],
                 color="white", lw=3.2*s, solid_capstyle="round", zorder=4)


def phone(ax, x, y, s=1.0, color=NAVY, screen_color=WHITE):
    ax.add_patch(FancyBboxPatch((x - 0.32*s, y - 0.62*s), 0.64*s, 1.24*s,
                                 boxstyle="round,pad=0,rounding_size=0.09",
                                 facecolor=color, zorder=3))
    ax.add_patch(Rectangle((x - 0.25*s, y - 0.48*s), 0.5*s, 1.0*s,
                            color=screen_color, zorder=4))


def server(ax, x, y, s=1.0, color=BLUE):
    ax.add_patch(FancyBboxPatch((x - 0.5*s, y - 0.5*s), 1.0*s, 1.0*s,
                                 boxstyle="round,pad=0,rounding_size=0.06",
                                 facecolor=color, zorder=3))
    for i in range(3):
        ax.add_patch(Rectangle((x - 0.35*s, y - 0.35*s + i*0.3*s), 0.7*s, 0.12*s,
                                color="white", zorder=4))


def db_cylinder(ax, x, y, w=1.0, h=1.0, color=TEAL):
    ax.add_patch(Rectangle((x - w/2, y - h/2), w, h, color=color, zorder=3))
    ax.add_patch(Ellipse((x, y - h/2), w, w*0.34, color=color, zorder=3))
    ax.add_patch(Ellipse((x, y + h/2), w, w*0.34, facecolor=color,
                          edgecolor="white", lw=1.2, zorder=4))


def lock(ax, x, y, s=1.0, color=AMBER):
    ax.add_patch(Rectangle((x - 0.32*s, y - 0.45*s), 0.64*s, 0.5*s, color=color, zorder=3))
    ax.add_patch(Arc((x, y + 0.05*s), 0.5*s, 0.6*s, theta1=0, theta2=180, color=color, lw=4.5*s, zorder=2))
    ax.add_patch(Circle((x, y - 0.18*s), 0.07*s, color="white", zorder=4))


def package_box(ax, x, y, s=1.0, color=BLUE):
    ax.add_patch(FancyBboxPatch((x - 0.5*s, y - 0.5*s), 1.0*s, 1.0*s,
                                 boxstyle="round,pad=0,rounding_size=0.05",
                                 facecolor=color, zorder=3))
    ax.plot([x - 0.5*s, x + 0.5*s], [y, y], color="white", lw=2, zorder=4)
    ax.plot([x, x], [y - 0.5*s, y + 0.5*s], color="white", lw=2, zorder=4)


def map_pin(ax, x, y, s=1.0, color=AMBER):
    ax.add_patch(Circle((x, y + 0.18*s), 0.33*s, color=color, zorder=3))
    ax.add_patch(Polygon([(x - 0.22*s, y + 0.02*s), (x + 0.22*s, y + 0.02*s), (x, y - 0.55*s)],
                          closed=True, color=color, zorder=3))
    ax.add_patch(Circle((x, y + 0.18*s), 0.12*s, color="white", zorder=4))


def building(ax, x, y, s=1.0, color=NAVY):
    ax.add_patch(Rectangle((x - 0.45*s, y - 0.6*s), 0.9*s, 1.2*s, color=color, zorder=3))
    for row in range(3):
        for col in range(2):
            wx = x - 0.28*s + col*0.36*s
            wy = y - 0.4*s + row*0.33*s
            ax.add_patch(Rectangle((wx, wy), 0.16*s, 0.16*s, color="white", zorder=4))


def chart_bars(ax, x, y, s=1.0, color=TEAL):
    for i, h in enumerate([0.3, 0.6, 0.45, 0.8]):
        ax.add_patch(Rectangle((x - 0.6*s + i*0.32*s, y - 0.5*s), 0.22*s, h*s, color=color, zorder=3))


def gear(ax, x, y, s=1.0, color=GRAY):
    ax.add_patch(Circle((x, y), 0.36*s, color=color, zorder=3))
    for i in range(8):
        a = i * math.pi / 4
        tx, ty = x + 0.46*s*math.cos(a), y + 0.46*s*math.sin(a)
        ax.add_patch(Rectangle((tx - 0.08*s, ty - 0.08*s), 0.16*s, 0.16*s, color=color, zorder=3))
    ax.add_patch(Circle((x, y), 0.16*s, color="white", zorder=4))


def browser_window(ax, x, y, w=2.6, h=1.8, color=WHITE, border=GRAY):
    ax.add_patch(FancyBboxPatch((x - w/2, y - h/2), w, h,
                                 boxstyle="round,pad=0,rounding_size=0.06",
                                 facecolor=color, edgecolor=border, lw=1.2, zorder=2))
    ax.add_patch(Rectangle((x - w/2, y + h/2 - 0.22), w, 0.22, color=border, zorder=3))
    for i, c in enumerate([RED, AMBER, TEAL]):
        ax.add_patch(Circle((x - w/2 + 0.14 + i*0.16, y + h/2 - 0.11), 0.045, color=c, zorder=4))


def magnifier(ax, x, y, s=1.0, color=NAVY):
    ax.add_patch(Circle((x, y), 0.3*s, facecolor="none", edgecolor=color, lw=4*s, zorder=4))
    ax.plot([x + 0.22*s, x + 0.5*s], [y - 0.22*s, y - 0.5*s], color=color, lw=4*s,
            solid_capstyle="round", zorder=4)


def gradient_bg(ax, w, h, c1=NAVY, c2=NAVY2):
    grad = plt.cm.colors.LinearSegmentedColormap.from_list("bg", [c1, c2])
    ax.imshow([[0, 1], [0, 1]], cmap=grad, extent=[0, w, 0, h], aspect="auto", zorder=0)


# ── Per-slide illustration builders ────────────────────────────────────────
def slide01_title():
    fig, ax = new_canvas(7, 6)
    gradient_bg(ax, 14, 12, NAVY, NAVY2)
    cloud(ax, 3.2, 8.5, 1.6, GRAY)
    phone(ax, 9.5, 6.5, 2.6, WHITE, LIGHT)
    package_box(ax, 9.5, 9.4, 1.1, AMBER)
    arrow(ax, (4.6, 8.3), (8.2, 7.0), color=GRAY, lw=2)
    return save(fig, "s01.png")


def slide02_what_is():
    fig, ax = new_canvas(7, 6)
    phone(ax, 7, 5.5, 2.4, NAVY, LIGHT)
    shield(ax, 7, 8.2, 1.3, TEAL)
    building(ax, 2.2, 9.2, 1.3, DARKGRAY)
    cloud(ax, 11.8, 9.2, 1.4, BLUE)
    arrow(ax, (2.9, 8.5), (6.1, 6.6), color=GRAY, lw=1.6, style="->")
    arrow(ax, (11.2, 8.5), (7.9, 6.6), color=GRAY, lw=1.6, style="->")
    return save(fig, "s02.png")


def slide03_why_private():
    fig, ax = new_canvas(7, 6)
    # left: generic public store with X
    ax.add_patch(Circle((3.5, 7), 1.6, color=LIGHT, zorder=1))
    package_box(ax, 3.5, 7, 1.6, GRAY)
    ax.plot([2.6, 4.4], [6.1, 7.9], color=RED, lw=5, zorder=5)
    ax.plot([2.6, 4.4], [7.9, 6.1], color=RED, lw=5, zorder=5)
    # right: shield + 3 orgs
    ax.add_patch(Circle((10.5, 7), 1.6, color=LIGHT, zorder=1))
    shield(ax, 10.5, 7, 1.7, TEAL)
    for i, bx in enumerate([8.6, 10.5, 12.4]):
        building(ax, bx, 3.2, 0.9, DARKGRAY)
        arrow(ax, (10.5, 5.6), (bx, 3.9), color=GRAY, lw=1.6, style="->")
    return save(fig, "s03.png")


def slide04_features():
    fig, ax = new_canvas(7, 6)
    icons = [package_box, building, lock, map_pin, shield, chart_bars]
    colors = [BLUE, DARKGRAY, AMBER, RED, TEAL, BLUE]
    positions = [(3.2, 9), (8.8, 9), (3.2, 5.6), (8.8, 5.6), (3.2, 2.2), (8.8, 2.2)]
    for icon, color, (x, y) in zip(icons, colors, positions):
        ax.add_patch(FancyBboxPatch((x - 1.6, y - 1.3), 3.2, 2.6,
                                     boxstyle="round,pad=0,rounding_size=0.18",
                                     facecolor=LIGHT, zorder=1))
        if icon is shield:
            icon(ax, x, y, 1.3, color)
        else:
            icon(ax, x, y, 1.3, color)
    return save(fig, "s04.png")


def slide05_stack():
    fig, ax = new_canvas(7, 6.4)
    layers = [
        ("Infrastructure — Docker / Nginx / Certbot", NAVY, gear),
        ("Database — PostgreSQL 15 + Prisma", "#1a3a66", db_cylinder),
        ("Object Storage — MinIO (S3-compatible)", "#1f5fb0", package_box),
        ("Backend API — Node.js 20 + Express + TS", BLUE, server),
        ("Frontend / Client — React 19 + Android Kotlin", "#5a9bf2", phone),
    ]
    w, gap = 12.0, 0.18
    bh = 1.7
    y0 = 1.2
    for i, (label, color, icon_fn) in enumerate(layers):
        y = y0 + i * (bh + gap)
        ax.add_patch(FancyBboxPatch((1.2, y), w, bh,
                                     boxstyle="round,pad=0,rounding_size=0.1",
                                     facecolor=color, zorder=2))
        icon_fn(ax, 2.3, y + bh/2, 0.9, "white") if icon_fn is not db_cylinder else icon_fn(ax, 2.3, y + bh/2, 0.8, 0.8, "white")
    return save(fig, "s05.png")


def slide06_architecture():
    fig, ax = new_canvas(7, 6.4)
    box(ax, 7, 11, 5, 1.1, "Internet (HTTPS)", color=DARKGRAY)
    box(ax, 7, 9, 7, 1.1, "Nginx Reverse Proxy (SSL)", color=NAVY)
    box(ax, 3.6, 6.8, 4.4, 1.1, "Backend API (Node.js)", color=BLUE)
    box(ax, 10.4, 6.8, 4.4, 1.1, "Admin Portal (React)", color=BLUE)
    box(ax, 3.6, 4.6, 4.4, 1.1, "PostgreSQL (Prisma)", color=TEAL)
    box(ax, 10.4, 4.6, 4.4, 1.1, "MinIO (APK storage)", color=TEAL)
    box(ax, 7, 2.2, 5, 1.1, "Android Terminal (Kotlin)", color=AMBER, textcolor=NAVY)
    arrow(ax, (7, 10.45), (7, 9.55))
    arrow(ax, (5.8, 8.45), (4.3, 7.35))
    arrow(ax, (8.2, 8.45), (9.7, 7.35))
    arrow(ax, (3.6, 6.25), (3.6, 5.15))
    arrow(ax, (10.4, 6.25), (10.4, 5.15))
    arrow(ax, (10.4, 4.05), (8.2, 2.7))
    return save(fig, "s06.png")


def slide07_backend_modules():
    fig, ax = new_canvas(7, 6.4)
    cx, cy = 7, 6.2
    box(ax, cx, cy, 3.0, 1.4, "Express\nAPI Core", color=NAVY)
    modules = ["auth.ts", "apps.ts", "catalog.ts", "customers.ts", "analytics.ts", "events.ts"]
    colors = [AMBER, BLUE, TEAL, DARKGRAY, "#5a9bf2", RED]
    r = 4.6
    for i, (m, c) in enumerate(zip(modules, colors)):
        a = math.pi/2 + i * (2*math.pi/len(modules))
        x, y = cx + r*math.cos(a), cy + r*math.sin(a)
        arrow(ax, (cx, cy), (x, y), color=GRAY, lw=1.8)
        box(ax, x, y, 2.6, 1.0, m, color=c, fontsize=11)
    return save(fig, "s07.png")


def slide08_erd():
    fig, ax = new_canvas(7, 6.4)
    tables = ["Admin", "Customer", "Category", "App",
              "Entitlement", "Terminal", "Download\nEvent", "AuditLog"]
    colors = [AMBER, BLUE, TEAL, DARKGRAY, "#5a9bf2", RED, NAVY, "#7a5af2"]
    cols = 4
    for i, (t, c) in enumerate(zip(tables, colors)):
        col, row = i % cols, i // cols
        x = 2.0 + col * 3.3
        y = 9.0 - row * 3.2
        box(ax, x, y, 2.8, 1.3, t, color=c, fontsize=10.5)
    # relationship lines (simplified)
    pairs = [(1, 4), (3, 4), (1, 5), (3, 6), (5, 6), (0, 7)]
    def center(i):
        col, row = i % cols, i // cols
        return (2.0 + col*3.3, 9.0 - row*3.2)
    for a, b in pairs:
        arrow(ax, center(a), center(b), color=GRAY, lw=1.3, style="-")
    return save(fig, "s08.png")


def slide09_android():
    fig, ax = new_canvas(7, 6.4)
    phone(ax, 7, 6.4, 3.4, NAVY, LIGHT)
    for i in range(6):
        col, row = i % 2, i // 2
        x = 7 - 0.95 + col * 1.9
        y = 8.0 - row * 1.4
        ax.add_patch(FancyBboxPatch((x - 0.6, y - 0.45), 1.2, 0.9,
                                     boxstyle="round,pad=0,rounding_size=0.08",
                                     facecolor=BLUE, zorder=5))
    lock(ax, 2.6, 10.2, 1.1, AMBER)
    gear(ax, 11.4, 10.2, 1.1, TEAL)
    shield(ax, 11.4, 2.6, 1.1, TEAL)
    return save(fig, "s09.png")


def slide10_containers():
    fig, ax = new_canvas(7, 6.4)
    box(ax, 7, 10.5, 4.2, 1.1, "Nginx Gateway", color=NAVY)
    names = ["postgres", "minio", "backend", "admin-portal"]
    colors = [TEAL, AMBER, BLUE, "#5a9bf2"]
    xs = [2.2, 5.3, 8.6, 11.7]
    for x, n, c in zip(xs, names, colors):
        ax.add_patch(FancyBboxPatch((x - 1.3, 3.0), 2.6, 3.4,
                                     boxstyle="round,pad=0,rounding_size=0.12",
                                     facecolor=c, zorder=3))
        ax.text(x, 4.7, n, ha="center", va="center", color="white",
                fontsize=11, fontweight="bold", rotation=0, zorder=4)
        arrow(ax, (7, 9.9), (x, 6.5), color=GRAY, lw=1.6)
    return save(fig, "s10.png")


def slide11_balance():
    fig, ax = new_canvas(7, 6.4)
    ax.plot([2, 12], [7, 7], color=GRAY, lw=3, zorder=2)
    ax.plot([7, 7], [7, 10.5], color=GRAY, lw=3, zorder=2)
    ax.add_patch(Circle((3.2, 6.0), 1.5, color=LIGHT, zorder=1))
    package_box(ax, 3.2, 6.0, 1.4, DARKGRAY)
    ax.add_patch(Circle((10.8, 6.0), 1.5, color=LIGHT, zorder=1))
    shield(ax, 10.8, 6.0, 1.5, TEAL)
    ax.plot([2, 3.2], [7, 7.3], color=GRAY, lw=2)
    ax.plot([12, 10.8], [7, 7.3], color=GRAY, lw=2)
    return save(fig, "s11.png")


def slide12_rings():
    fig, ax = new_canvas(7, 6.4)
    gradient_bg(ax, 14, 12.8, NAVY, NAVY2)
    for i, (r, c) in enumerate([(5.2, "#1a3a66"), (4.0, "#234a82"), (2.8, "#2d5aa0"), (1.6, BLUE)]):
        ax.add_patch(Circle((7, 6.4), r, facecolor="none", edgecolor=c, lw=3, zorder=2+i))
    lock(ax, 7, 6.4, 1.2, AMBER)
    gear(ax, 7, 11.2, 0.8, TEAL)
    shield(ax, 11.6, 6.4, 0.9, TEAL, check=False)
    chart_bars(ax, 2.4, 6.4, 0.8, "#5a9bf2")
    return save(fig, "s12.png")


def slide13_integrity():
    fig, ax = new_canvas(7, 6.4)
    server(ax, 2.4, 6.4, 1.6, BLUE)
    phone(ax, 11.6, 6.4, 2.0, NAVY, LIGHT)
    ax.add_patch(FancyBboxPatch((5.6, 5.6), 2.8, 1.6,
                                 boxstyle="round,pad=0,rounding_size=0.1",
                                 facecolor=LIGHT, edgecolor=TEAL, lw=2, zorder=3))
    ax.plot([6.3, 6.9, 7.6], [6.1, 5.75, 6.7], color=TEAL, lw=4,
            solid_capstyle="round", zorder=4)
    magnifier(ax, 7, 8.2, 1.0, NAVY)
    arrow(ax, (3.3, 6.4), (5.5, 6.4), color=GRAY, lw=2)
    arrow(ax, (8.5, 6.4), (10.5, 6.4), color=GRAY, lw=2)
    return save(fig, "s13.png")


def slide14_split_flow():
    fig, ax = new_canvas(7, 6.4)
    phone(ax, 2.2, 9.5, 1.1, NAVY, LIGHT)
    server(ax, 5.2, 9.5, 1.0, DARKGRAY)
    arrow(ax, (2.8, 9.5), (4.6, 9.5), color=GRAY, lw=1.2, style="->")
    arrow(ax, (4.6, 9.1), (2.8, 9.1), color=GRAY, lw=1.2, style="->")
    ax.text(3.7, 10.1, "tiny request", ha="center", fontsize=9, color=DARKGRAY)

    cloud(ax, 9.8, 4.5, 1.8, BLUE)
    cols, rows = 5, 3
    i = 0
    for r in range(rows):
        for c in range(cols):
            x = 1.2 + c * 1.1
            y = 1.0 + r * 1.1
            phone(ax, x, y, 0.55, NAVY, LIGHT)
            arrow(ax, (8.6, 4.0), (x + 0.3, y + 0.3), color=AMBER, lw=1.6)
            i += 1
    return save(fig, "s14.png")


def slide15_concurrency():
    fig, ax = new_canvas(7, 6.4)
    box(ax, 7, 11.0, 7, 1.0, "Lakhs of Terminals", color=DARKGRAY)
    box(ax, 4, 9.2, 4, 0.9, "Load Balancer", color=NAVY, fontsize=10)
    box(ax, 10, 9.2, 4, 0.9, "CDN Edge", color=AMBER, fontsize=10, textcolor=NAVY)
    box(ax, 4, 7.2, 4.2, 0.9, "Node.js API Cluster", color=BLUE, fontsize=10)
    box(ax, 2.3, 5.2, 2.6, 0.9, "Redis Cache", color="#5a9bf2", fontsize=9.5)
    box(ax, 5.7, 5.2, 2.6, 0.9, "Async Queue", color="#5a9bf2", fontsize=9.5)
    box(ax, 4, 3.0, 7, 1.0, "PostgreSQL Primary\n+ Read Replicas", color=TEAL, fontsize=10)
    arrow(ax, (6, 10.5), (4.3, 9.65))
    arrow(ax, (8.5, 10.5), (9.8, 9.65))
    arrow(ax, (4, 8.75), (4, 7.65))
    arrow(ax, (3.2, 6.75), (2.6, 5.65))
    arrow(ax, (4.7, 6.75), (5.5, 5.65))
    arrow(ax, (3, 4.75), (3.8, 3.5))
    return save(fig, "s15.png")


def slide16_flow():
    fig, ax = new_canvas(7, 5.2)
    steps = [("1", AMBER), ("2", BLUE), ("3", TEAL), ("4", DARKGRAY),
             ("5", "#5a9bf2"), ("6", RED), ("7", NAVY)]
    n = len(steps)
    xs = [1.4 + i * 1.85 for i in range(n)]
    y = 4.0
    for i in range(n - 1):
        arrow(ax, (xs[i] + 0.55, y), (xs[i+1] - 0.55, y), color=GRAY, lw=2)
    for (label, color), x in zip(steps, xs):
        ax.add_patch(Circle((x, y), 0.55, color=color, zorder=3))
        ax.text(x, y, label, ha="center", va="center", color="white",
                 fontsize=15, fontweight="bold", zorder=4)
    return save(fig, "s16.png")


def slide17_portal():
    fig, ax = new_canvas(7, 6.0)
    browser_window(ax, 7, 6.0, 11.5, 8.6, WHITE, GRAY)
    ax.add_patch(Rectangle((2.0, 2.2), 2.4, 6.6, color=NAVY, zorder=3))
    for i, c in enumerate([BLUE, TEAL, AMBER, DARKGRAY, RED, "#5a9bf2"]):
        ax.add_patch(Circle((3.2, 3.3 + i*1.0), 0.28, color=c, zorder=4))
    for i, c in enumerate([BLUE, TEAL, AMBER]):
        ax.add_patch(FancyBboxPatch((5.0 + i*2.6, 7.6), 2.2, 1.0,
                                     boxstyle="round,pad=0,rounding_size=0.08",
                                     facecolor=c, zorder=4))
    for lx, ly in [(6, 4.5), (7.5, 4.0), (9, 5.2), (10.5, 3.6), (8, 3.0)]:
        ax.add_patch(Circle((lx, ly), 0.1, color=TEAL, zorder=5))
    ax.add_patch(FancyBboxPatch((5.0, 2.4), 7.3, 3.4,
                                 boxstyle="round,pad=0,rounding_size=0.08",
                                 facecolor=LIGHT, edgecolor=GRAY, lw=1, zorder=3))
    return save(fig, "s17.png")


def slide18_roadmap():
    fig, ax = new_canvas(7, 5.6)
    xs = [1.5, 3.8, 6.1, 8.4, 10.7]
    ys = [2.5, 4.0, 2.8, 4.5, 3.2]
    ax.plot(xs, ys, color=AMBER, lw=3, ls=(0, (4, 3)), zorder=2)
    icons = [gear, cloud, db_cylinder, gear, chart_bars]
    colors = [TEAL, BLUE, AMBER, DARKGRAY, "#5a9bf2"]
    for x, y, icon, c in zip(xs, ys, icons, colors):
        ax.add_patch(Circle((x, y), 0.55, color=NAVY, zorder=3))
        if icon is db_cylinder:
            icon(ax, x, y, 0.45, 0.5, c)
        else:
            icon(ax, x, y, 0.6, c)
    return save(fig, "s18.png")


def slide19_closing():
    fig, ax = new_canvas(7, 6)
    gradient_bg(ax, 14, 12, NAVY, NAVY2)
    for r in [1.4, 2.2, 3.0, 3.8]:
        ax.add_patch(Circle((7, 6), r, facecolor="none", edgecolor=GRAY, lw=1.2, alpha=0.5, zorder=2))
    phone(ax, 7, 6, 2.2, WHITE, LIGHT)
    return save(fig, "s19.png")


SLIDE_IMAGE_BUILDERS = [
    slide01_title, slide02_what_is, slide03_why_private, slide04_features,
    slide05_stack, slide06_architecture, slide07_backend_modules, slide08_erd,
    slide09_android, slide10_containers, slide11_balance, slide12_rings,
    slide13_integrity, slide14_split_flow, slide15_concurrency, slide16_flow,
    slide17_portal, slide18_roadmap, slide19_closing,
]


# ── Slide text content ──────────────────────────────────────────────────────
SLIDES = [
    dict(title="WL BizStore",
         subtitle="A Private Enterprise App Store for Worldline Payment Terminals",
         bullets=["Secure, self-hosted Android app distribution platform",
                  "Built exclusively for Worldline-managed POS / kiosk terminals",
                  "Replaces Google Play Store with a fully controlled, enterprise-owned alternative",
                  "Worldline Global Services India · 2026"],
         title_slide=True),
    dict(title="What Is WL BizStore?",
         bullets=["A private, enterprise-only app store — not available on the public internet / Play Store",
                  "Distributes apps exclusively to company-managed POS/kiosk terminals",
                  "Every terminal is enrolled with a unique cryptographic identity before it can see or download anything",
                  "Apps are organized by category and assigned to customers via an entitlement model",
                  "Every download is logged with GPS location, timestamp, and install result",
                  "Supports silent, unattended installation on Android Enterprise kiosk devices"]),
    dict(title="Why a Private App Store?",
         bullets=["Public app stores give no control over which apps/versions are distributed",
                  "No way to restrict visibility per customer / bank / retailer",
                  "No enterprise-grade audit trail of who downloaded what, when, and where",
                  "WL BizStore: customer-level entitlements — Bank A never sees Retailer B's apps",
                  "Checksum-verified binaries — tamper-proof distribution",
                  "Centralized kill-switch — retire/wipe a terminal, instantly revoking its API key",
                  "Full compliance trail — every admin action and download is audit-logged"]),
    dict(title="Key Features",
         bullets=["Centralized app catalog — categorized, versioned, with descriptions & screenshots",
                  "Customer entitlement management — assign apps to specific organizations",
                  "Per-terminal enrollment — unique, rotatable/revocable API key per device",
                  "GPS-tagged download telemetry on every download event",
                  "Checksum-verified, silent installs (Device Owner mode)",
                  "Admin analytics dashboard — trends, top apps, live terminal map",
                  "One-click Excel export of apps / customers / downloads",
                  "Full audit log of every admin action"]),
    dict(title="Technology Stack Overview",
         bullets=["Frontend (Admin Portal): React 19 + TypeScript + Vite 8, React Router, Recharts, Leaflet, Axios",
                  "Backend API: Node.js 20 + Express 4 + TypeScript, Prisma ORM, Zod, JWT + bcrypt, Helmet, express-rate-limit",
                  "Database: PostgreSQL 15",
                  "Object Storage: MinIO (S3-compatible), AWS SigV4 pre-signed URLs",
                  "Android Client: Kotlin, minSdk 26 / targetSdk 34, Retrofit2 + OkHttp, Coroutines, Device Owner APIs",
                  "Infrastructure: Docker + Docker Compose, Nginx reverse proxy, Let's Encrypt / Certbot",
                  "Deployment: Self-hosted Ubuntu VPS, horizontally scalable to Kubernetes"]),
    dict(title="High-Level System Architecture",
         bullets=["Nginx is the single public entry point for the entire platform",
                  "/api/* routes to the Node.js backend; / serves the React admin portal",
                  "All internal services (Postgres, MinIO, backend) are bound to 127.0.0.1 only",
                  "Every component runs as an isolated Docker container via docker-compose",
                  "The backend never streams APK bytes itself — it only issues signed download URLs"]),
    dict(title="Backend API Architecture",
         bullets=["Modular Express + TypeScript route files: auth, apps, catalog, customers, categories, terminals, analytics, events",
                  "Middleware layer enforces three access levels: requireAdmin, requireSuperAdmin, requireTerminal",
                  "Every request body validated with Zod schemas before touching the database",
                  "Prisma ORM provides type-safe PostgreSQL access and migration management"]),
    dict(title="Data Model (Database Schema)",
         bullets=["Admin — portal users with role-based access (ADMIN / SUPER_ADMIN)",
                  "Customer — business organizations, each with a short human-readable code",
                  "Category — app groupings (Payment, Utilities, Reporting, Security...)",
                  "App — package name, version, checksum, size, MinIO reference, publish status",
                  "CustomerEntitlement — which apps a customer's terminals are allowed to see",
                  "Terminal — enrolled devices, API key, branch code, status",
                  "DownloadEvent — one row per download attempt with GPS + install status",
                  "AdminAuditLog — immutable record of every admin action"]),
    dict(title="Android Client App",
         bullets=["Native Kotlin app, minSdk 26 (Android 8.0+) to targetSdk 34",
                  "Built for Android Enterprise Device Owner mode — fully silent install, zero user prompts",
                  "Retrofit2 + OkHttp with an X-Terminal-Key header interceptor for authenticated requests",
                  "Kotlin Coroutines handle async download/install flows without blocking the UI",
                  "Core screens: Enrollment, Catalog, App Detail (download → verify → install → report)",
                  "Terminal API key stored in EncryptedSharedPreferences (AES-256-GCM)"]),
    dict(title="Containerization & Deployment",
         bullets=["Entire stack defined in docker-compose.yml + a production override file",
                  "Independent containers: postgres, minio, backend, admin-portal",
                  "Nginx terminates SSL (Let's Encrypt) and routes to each container",
                  "Internal services bound to 127.0.0.1 only — never directly exposed to the internet",
                  "One command (docker compose up -d --build) rebuilds and redeploys the entire platform"]),
    dict(title="Security Architecture: Overview",
         bullets=["User Auth: JWT + bcrypt + refresh tokens (vs. Google Account + 2FA)",
                  "Device Auth: per-device cryptographic API key (vs. Google Play Services)",
                  "App Integrity: SHA-256 checksum, verified server + client side (vs. Play Protect)",
                  "Distribution Control: Customer Entitlement model, per-app per-org",
                  "Audit Trail: full AdminAuditLog on every write action",
                  "Transport: HTTPS + Android Network Security Config (cleartext blocked)",
                  "Rate Limiting: express-rate-limit, 200 req / 15 min per IP",
                  "Secrets Storage: EncryptedSharedPreferences (AES-256-GCM)"]),
    dict(title="Security Deep Dive: Authentication & Access Control",
         bullets=["Admin login: bcrypt-hashed passwords, 1-hour JWT access tokens + 7-day refresh tokens (separate secret)",
                  "Generic \"Invalid credentials\" error — prevents user/email enumeration",
                  "Terminal enrollment: 48-character cryptographically random API key per device",
                  "Role-based middleware rejects retired/wiped terminals even with a valid key",
                  "Helmet applies 11 HTTP security headers to every response",
                  "Zod validates every endpoint's input before it reaches the database"]),
    dict(title="Security Deep Dive: App Integrity & Data Protection",
         bullets=["Upload time: server computes SHA-256 checksum, stored immutably with the binary",
                  "Download time: Android client re-computes SHA-256 and rejects install on mismatch",
                  "Pre-signed URLs (AWS SigV4): scoped to one object, expire after 15 minutes",
                  "Request size limits: 10 MB JSON cap, 200 MB APK upload cap",
                  "Strict package-name regex prevents path-traversal-style identifiers",
                  "All traffic forced over HTTPS/TLS; cleartext HTTP blocked on Android"]),
    dict(title="Scaling to Millions of Downloads: The Core Design Choice",
         bullets=["The single most important decision: APK binaries are 100% offloaded from the API servers",
                  "1. Terminal sends a tiny (~1 KB) request → backend checks entitlement in milliseconds",
                  "2. Backend returns a pre-signed URL pointing directly at object storage",
                  "3. Terminal downloads the APK directly from storage/CDN — API never touches the bytes",
                  "Same pattern used by Google Play, Apple App Store, and Netflix",
                  "API tier's CPU/memory stays flat whether 100 or 500,000 terminals download at once"]),
    dict(title="High-Concurrency Architecture (100K+ Terminals)",
         bullets=["Redis catalog caching: 50,000 terminals hit Redis (<1ms), not the database",
                  "Async telemetry queue: events return 202 Accepted in ~2ms, batch-inserted by a worker",
                  "Phased rollout + jitter delay prevents a 'thundering herd' of simultaneous requests",
                  "Stateless JWT/API-key auth allows any number of Node.js replicas behind a load balancer"]),
    dict(title="End-to-End Flow: Enroll → Download → Install",
         bullets=["1. Enroll — short Customer Code binds the device, backend issues a unique API key",
                  "2. Browse — terminal fetches its entitled catalog, filtered by category",
                  "3. Request — backend verifies entitlement, returns pre-signed URL + checksum",
                  "4. Download — terminal streams the APK directly from object storage",
                  "5. Verify — terminal re-computes SHA-256 and compares checksums",
                  "6. Install — silent install via Device Owner APIs",
                  "7. Report — install result + GPS sent back as a telemetry event"]),
    dict(title="Admin Portal Capabilities",
         bullets=["Dashboard — real-time KPIs: total apps, active terminals, downloads today, top apps",
                  "Apps — upload APKs, publish/unpublish, per-app download history, Excel export",
                  "Categories — organize the catalog; click into a category to see its apps",
                  "Customers — manage organizations and their app entitlements",
                  "Terminals — view/rotate/retire device API keys",
                  "Analytics Map — live geographic visualization of download events",
                  "Downloads — searchable/filterable download event log"]),
    dict(title="Roadmap & Future Enhancements",
         bullets=["Redis-backed catalog caching and async telemetry queue",
                  "CDN integration (Cloudflare/CloudFront) in front of MinIO/S3",
                  "PostgreSQL read replicas + PgBouncer connection pooling",
                  "Kubernetes-based auto-scaling for the backend API tier",
                  "Push-notification-driven, phased update rollout",
                  "Enhanced reporting: scheduled digests, customizable dashboards"]),
    dict(title="Thank You",
         subtitle="WL BizStore — Secure, Scalable, Enterprise-Owned App Distribution",
         bullets=["Questions & Discussion"],
         title_slide=True),
]


def build_pptx():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    for idx, (data, img_builder) in enumerate(zip(SLIDES, SLIDE_IMAGE_BUILDERS), start=1):
        img_path = img_builder()
        slide = prs.slides.add_slide(blank)

        is_title = data.get("title_slide", False)

        # Background
        bg_color = PPTX_NAVY if is_title else PPTX_WHITE
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = bg_color
        bg.line.fill.background()
        bg.shadow.inherit = False

        if is_title:
            pic = slide.shapes.add_picture(img_path, Inches(0), Inches(0),
                                            height=prs.slide_height)
            pic_w = pic.width
            pic.left = prs.slide_width - pic_w
            tb = slide.shapes.add_textbox(Inches(0.7), Inches(2.6), Inches(7.5), Inches(2.2))
            tf = tb.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = data["title"]
            p.font.size = Pt(44)
            p.font.bold = True
            p.font.color.rgb = PPTX_WHITE
            if data.get("subtitle"):
                p2 = tf.add_paragraph()
                p2.text = data["subtitle"]
                p2.font.size = Pt(18)
                p2.font.color.rgb = RGBColor(0xB0, 0xC4, 0xDE)
                p2.space_before = Pt(12)
            bt = slide.shapes.add_textbox(Inches(0.7), Inches(5.0), Inches(7.5), Inches(2.0))
            btf = bt.text_frame
            btf.word_wrap = True
            for i, b in enumerate(data["bullets"]):
                para = btf.paragraphs[0] if i == 0 else btf.add_paragraph()
                para.text = f"• {b}"
                para.font.size = Pt(14)
                para.font.color.rgb = RGBColor(0xD0, 0xDC, 0xF0)
                para.space_after = Pt(6)
            continue

        # Title bar
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(1.0))
        bar.fill.solid()
        bar.fill.fore_color.rgb = PPTX_NAVY
        bar.line.fill.background()
        bar.shadow.inherit = False
        tb = bar.text_frame
        tb.word_wrap = True
        tb.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tb.paragraphs[0]
        p.text = f"{idx:02d}   {data['title']}"
        p.font.size = Pt(26)
        p.font.bold = True
        p.font.color.rgb = PPTX_WHITE
        tb.margin_left = Inches(0.4)

        # Bullet content (left column)
        content = slide.shapes.add_textbox(Inches(0.5), Inches(1.3), Inches(7.1), Inches(5.8))
        ctf = content.text_frame
        ctf.word_wrap = True
        for i, b in enumerate(data["bullets"]):
            para = ctf.paragraphs[0] if i == 0 else ctf.add_paragraph()
            para.text = f"•  {b}"
            para.font.size = Pt(15)
            para.font.color.rgb = PPTX_DARK
            para.space_after = Pt(10)

        # Image (right column)
        pic = slide.shapes.add_picture(img_path, Inches(8.0), Inches(1.4), width=Inches(4.9))
        if pic.top + pic.height > prs.slide_height:
            pic.height = int(pic.height * (prs.slide_height - Inches(1.6)) / pic.height)

    out_path = os.path.join(os.path.dirname(__file__), "WL_Playstore_Presentation.pptx")
    prs.save(out_path)
    return out_path


if __name__ == "__main__":
    path = build_pptx()
    print(f"Saved: {path}")
