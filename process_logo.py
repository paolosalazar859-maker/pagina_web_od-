import sys
try:
    from PIL import Image
except ImportError:
    import subprocess
    print("Instalando Pillow para purificar el logo...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

def clean_logo():
    print("Abriendo logo original...")
    img = Image.open("logo.jpg").convert("RGBA")
    width, height = img.size
    
    # Recortar solo la mitad superior donde está el monograma "OD"
    # descartando el texto rasterizado antiguo.
    crop_height = int(height * 0.6)
    img = img.crop((0, 0, width, crop_height))
    
    data = img.getdata()
    new_data = []
    
    brand_color = (255, 255, 255) # Blanco para que se pueda pintar con CSS o dejarlo limpio
    
    print("Eliminando fondo blanco y extrayendo icono...")
    for item in data:
        luminance = 0.299 * item[0] + 0.587 * item[1] + 0.114 * item[2]
        if luminance > 200: # Color de fondo claro
            new_data.append((255, 255, 255, 0)) # Transparente
        else:
            # Trazo del icono "OD"
            alpha = int(max(0, min(255, (255 - luminance) * 1.5)))
            new_data.append((brand_color[0], brand_color[1], brand_color[2], alpha))
            
    img.putdata(new_data)
    
    # Recorte ajustado al contenido (Tight Bounding Box)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    img.save("logo_icon.png", "PNG")
    print("¡Exito! Logo guardado como logo_icon.png con fondo transparente.")

if __name__ == "__main__":
    clean_logo()
