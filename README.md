# Estimador de esfuerzo Oracle Fullstack

Aplicacion estatica para estimar dias persona por sistema, artefacto y complejidad para OFSC, MDW, AIA, BRM, Siebel, UIM, OSM y Oracle Database. Incluye un mantenedor en JavaScript puro para editar la matriz y guardar o descargar `estimaciones.json`.

## Uso recomendado

El archivo fuente de estimaciones es `estimaciones.json`. Para que la aplicacion lo lea automaticamente, abre la carpeta con un servidor local y entra a `index.html`.

Ejemplo rapido con Python:

```bash
python -m http.server 8000
```

Luego abre `http://localhost:8000`.

No abras `index.html` directamente como archivo local: el navegador no permite leer `estimaciones.json` automaticamente por seguridad. Usa el servidor local para que la matriz se cargue desde el JSON del proyecto.

La aplicacion funciona como un carrito de estimacion. En la pestana Catalogo selecciona sistema, modulo, complejidad y cantidad. En la pestana Carrito revisa los modulos seleccionados y los totales en dias por fase, base, contingencia y total. Tambien permite filtrar el catalogo, exportar el carrito a CSV y mantener el JSON de estimaciones desde la pestana Mantenedor.

## Guardado sin backend

El navegador no permite sobrescribir archivos locales sin permiso explicito. Por eso el boton `Guardar JSON` funciona asi:

- En navegadores con File System Access API, pide elegir donde guardar `estimaciones.json`.
- En otros navegadores, descarga un nuevo `estimaciones.json` con los cambios.

La aplicacion no carga datos guardados automaticamente en el almacenamiento del navegador ni mantiene copias embebidas de la matriz. Si cambias `estimaciones.json`, ese cambio es la fuente unica para la siguiente carga por servidor local.

## Supuestos de estimacion

Los valores incluidos son una semilla basada en practica habitual de implementaciones Oracle/telco y documentacion publica de artefactos por producto. No son SLA oficiales ni reemplazan la calibracion con datos historicos internos.

- Bajo: parametrizacion o cambio localizado.
- Medio: regla, mapeo o UI con prueba funcional acotada.
- Alto: integracion, datos o proceso con dependencias.
- Extra alto: diseno nuevo, impacto transversal, migracion o rendimiento critico.

Para madurar la herramienta, registra estimado vs. real por requerimiento y ajusta los dias por sistema/artefacto.
