#!/usr/bin/env python3
"""
Simple script to create placeholder icons for the Chrome extension.
Requires PIL/Pillow: pip install pillow
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Error: Pillow is not installed.")
    print("Install it with: pip install pillow")
    exit(1)

def create_icon(size, filename):
    """Create a simple icon with the AutoFlow logo concept"""
    # Create image with blue background
    img = Image.new('RGB', (size, size), color='#0066cc')
    draw = ImageDraw.Draw(img)
    
    # Draw a simple "AF" text or form symbol
    # For simplicity, draw a white rectangle representing a form
    padding = size // 4
    draw.rectangle(
        [padding, padding, size - padding, size - padding],
        outline='white',
        width=max(2, size // 16)
    )
    
    # Draw horizontal lines representing form fields
    line_count = 3
    line_spacing = (size - 2 * padding) // (line_count + 1)
    for i in range(1, line_count + 1):
        y = padding + i * line_spacing
        draw.line(
            [padding + size // 8, y, size - padding - size // 8, y],
            fill='white',
            width=max(1, size // 32)
        )
    
    # Save the image
    img.save(filename, 'PNG')
    print(f"Created {filename} ({size}x{size})")

if __name__ == '__main__':
    create_icon(16, 'icon16.png')
    create_icon(48, 'icon48.png')
    create_icon(128, 'icon128.png')
    print("\nIcons created successfully!")
    print("You can now load the extension in Chrome.")
