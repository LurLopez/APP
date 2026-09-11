# Guía y Checklist de Lanzamiento

El documento completo de despliegue, arquitectura CI/CD y estrategia SEO se encuentra en:
👉 [documentacion/lanzamiento.md](file:///home/lur/Lur/APP/documentacion/lanzamiento.md)

### Resumen Rápido:
* **Infraestructura:** Contabo Cloud VPS 4 (4 vCPU, 8 GB RAM, 100 GB SSD) ~5.50 €/mes sin permanencia. Región EE. UU.
* **Ambientes en el mismo VPS:**
  * `dev.tudominio.com` $\rightarrow$ Rama `development`, puerto 3001, BD `cifra_dev`.
  * `tudominio.com` $\rightarrow$ Rama `main`, puerto 3000, BD `cifra_prod`.
* **CI/CD:** GitHub Actions mediante SSH Action disparado por push a `development` o merge a `main`.
* **SEO:** Meta tags Open Graph, `robots.txt`, sitemap dinámico de empresas (`empresa.html?ticker=...`) y alta en Google Search Console.
