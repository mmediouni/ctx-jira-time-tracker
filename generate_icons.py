import zlib
import struct
import math

def create_png(width, height, get_pixel_func):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(bytes(raw_data)))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def draw_clock(x, y, w, h):
    cx = (w - 1) / 2.0
    cy = (h - 1) / 2.0
    radius = (min(w, h) / 2.0) - 1.0

    dx = x - cx
    dy = y - cy
    dist = math.sqrt(dx*dx + dy*dy)

    # Jira Blue: #0052CC (0, 82, 204), Accent: #00B8D9
    if dist > radius:
        return (0, 0, 0, 0) # transparent
    
    # Outer ring
    ring_thick = max(1.5, radius * 0.18)
    if dist > radius - ring_thick:
        # Border
        return (0, 82, 204, 255)
    
    # Inner face: dark Jira navy/slate
    # Check if clock hands
    # Center dot
    if dist < radius * 0.18:
        return (0, 184, 217, 255) # Cyan dot

    # Hour hand (pointing to 12)
    angle = math.atan2(dy, dx) # -pi to pi
    # 12 o'clock is dx ~ 0, dy < 0
    if abs(dx) <= max(1.0, radius * 0.12) and dy < 0 and dist < radius * 0.7:
        return (255, 255, 255, 255)
    
    # Minute hand (pointing to 3)
    if abs(dy) <= max(1.0, radius * 0.12) and dx > 0 and dist < radius * 0.6:
        return (0, 184, 217, 255)

    # Background of clock
    return (9, 30, 66, 255) # Jira deep dark blue

for size in [16, 32, 48, 128]:
    png_bytes = create_png(size, size, draw_clock)
    with open(f"icons/icon{size}.png", "wb") as f:
        f.write(png_bytes)
    print(f"Generated icons/icon{size}.png ({size}x{size})")

