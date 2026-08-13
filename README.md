# Leitner IA | Inteligencia competitiva para Battlecards accionables

> 🚀 **Acceso a la aplicación en Azure Container Apps:** [https://ca-web-ms4xecmmlqzua.wittycliff-993fb65f.centralus.azurecontainerapps.io/](https://ca-web-ms4xecmmlqzua.wittycliff-993fb65f.centralus.azurecontainerapps.io/)

> **Leitner IA convierte contexto comercial y competitivo en Battlecards estructuradas para ventas, preventa y marketing.**

Leitner IA es una aplicación web de inteligencia competitiva desarrollada para CONSEIN. Permite comparar a CONSEIN con empresas que participan en mercados, servicios o ecosistemas tecnológicos similares, por ejemplo, consultoras, partners de Microsoft y proveedores de nube como Amazon Web Services.

El usuario proporciona el contexto de la oportunidad, la empresa competidora, el sector y el servicio, producto o solución que desea evaluar. El agente organiza el análisis en tres capas complementarias y genera una Battlecard con hallazgos, ventajas, riesgos y recomendaciones comerciales.

## Contenido

- [Objetivo](#objetivo)
- [Problema que resuelve](#problema-que-resuelve)
- [¿Qué es una Battlecard?](#qué-es-una-battlecard)
- [Usuarios principales](#usuarios-principales)
- [Capacidades](#capacidades)
- [Metodología de análisis](#metodología-de-análisis)
- [Flujo funcional](#flujo-funcional)
- [Arquitectura conceptual](#arquitectura-conceptual)
- [Tecnologías](#tecnologías)
- [Experiencia web](#experiencia-web)
- [Seguridad y uso responsable](#seguridad-y-uso-responsable)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Despliegue](#despliegue)
- [Alcance del MVP](#alcance-del-mvp)
- [Documentación comercial](#documentación-comercial)

## Objetivo

Leitner IA busca acelerar y estandarizar la preparación de análisis competitivos. Su propósito es ayudar a los equipos comerciales a comprender una oportunidad, identificar diferencias relevantes y preparar argumentos de valor sustentados antes de una conversación con el cliente.

El agente no pretende declarar un ganador universal. Una ventaja depende del cliente, la industria, el alcance, las restricciones, la tecnología y el objetivo comercial de cada oportunidad.

## Problema que resuelve

La elaboración manual de Battlecards suele requerir reunir información dispersa, comparar empresas con criterios inconsistentes y transformar hallazgos técnicos en argumentos útiles para ventas. Esto provoca:

- Días de investigación y estructuración manual.
- Comparaciones superficiales o difíciles de reutilizar.
- Documentos diferentes para cada vendedor.
- Confusión entre capacidades empresariales, servicios y productos.
- Argumentos comerciales sin suficiente contexto técnico.
- Pérdida de conocimiento entre oportunidades.
- Riesgo de utilizar información desactualizada o no verificable.

Leitner IA establece una estructura común y convierte el contexto recibido en un documento preparado para revisión y uso comercial.

## ¿Qué es una Battlecard?

Una Battlecard es un documento breve y accionable que ayuda a un equipo comercial a posicionar una propuesta frente a una alternativa competitiva. Puede incluir:

- Resumen ejecutivo.
- Contexto de la oportunidad.
- Perfil de las empresas comparadas.
- Diferenciadores relevantes.
- Fortalezas y riesgos.
- Comparación de servicios.
- Evaluación de productos o soluciones.
- Objeciones previsibles.
- Recomendaciones y mensajes comerciales.
- Fuentes y fecha de consulta, cuando estén disponibles.

La Battlecard es un apoyo para preparar la conversación. No sustituye la validación del especialista, del responsable comercial ni de las fuentes originales.

## Usuarios principales

### Ventas

Obtiene argumentos claros, preguntas de descubrimiento y recomendaciones para posicionar la propuesta de CONSEIN.

### Preventa

Relaciona necesidades del cliente con capacidades técnicas, integraciones, riesgos y alternativas de implementación.

### Marketing

Identifica diferenciadores, mensajes, segmentos y oportunidades de posicionamiento.

### Gerencia

Promueve una metodología común para observar competidores, revisar oportunidades y reutilizar conocimiento comercial.

## Capacidades

### Generación guiada de Battlecards

El usuario proporciona:

- Empresa que será posicionada.
- Competidor o alternativa.
- Sector o industria.
- Servicio, producto o solución.
- Objetivo comercial.
- Contexto adicional de la oportunidad.

### Análisis estructurado

Leitner IA organiza los hallazgos según criterios consistentes. Esto permite comparar documentos y reutilizar el enfoque en distintas oportunidades.

### Orientación comercial

El resultado prioriza información que ayude a preparar una conversación: ventajas contextuales, riesgos, objeciones, oportunidades y acciones recomendadas.

### Generación documental

La Battlecard puede generarse como un documento descargable mediante procesos automatizados y almacenarse en los repositorios autorizados.

### Historial de Battlecards

La experiencia contempla una sección de Battlecards recientes para consultar resultados generados previamente y acceder a su detalle o descarga.

### Integración con conocimiento de CONSEIN

El agente puede enriquecer el análisis con conocimiento interno autorizado, capacidades, experiencias y material previamente aprobado.

## Metodología de análisis

Cada Battlecard se organiza en tres niveles. Separarlos evita mezclar reputación corporativa, capacidad de entrega y características técnicas.

### Nivel 1. Empresa

Evalúa la organización en términos generales:

- Posicionamiento.
- Capacidades organizacionales.
- Presencia o especialización.
- Alianzas y ecosistema.
- Diferenciadores empresariales.
- Riesgos competitivos.

### Nivel 2. Servicio

Compara cómo cada empresa entrega valor:

- Alcance del servicio.
- Especialización consultiva.
- Modelo de acompañamiento.
- Capacidad de implementación.
- Flexibilidad.
- Soporte y continuidad.
- Diferencias en la entrega.

### Nivel 3. Producto o solución

Analiza la propuesta tecnológica concreta:

- Capacidades técnicas.
- Integraciones.
- Alineación con el ecosistema Microsoft.
- Casos de uso.
- Restricciones.
- Riesgos de adopción.
- Recomendaciones para la oportunidad.

## Flujo funcional

1. **El usuario proporciona contexto:** empresa, competidor, sector, servicio, solución y objetivo comercial.
2. **Leitner IA interpreta la solicitud:** distingue los criterios empresariales, de servicio y técnicos.
3. **El agente investiga y consulta herramientas autorizadas:** recupera conocimiento interno o información externa según la configuración.
4. **Organiza los hallazgos:** separa hechos, inferencias, riesgos y recomendaciones.
5. **Genera la Battlecard:** produce un resumen ejecutivo y las secciones definidas por la metodología.
6. **Automatiza el documento:** Power Automate puede recibir el contenido estructurado, completar la plantilla y almacenarla en SharePoint.
7. **Devuelve el resultado:** la aplicación presenta el documento, su estado y el enlace de descarga.
8. **Registra la Battlecard:** el resultado queda disponible en el historial autorizado.

## Arquitectura conceptual

```text
Usuario comercial
       |
       v
Aplicación web React
       |
       v
Backend de la aplicación
       |
       v
Agente en Microsoft Foundry
       |
       +--------------------+
       |                    |
       v                    v
Herramientas MCP      Conocimiento CONSEIN
Investigación          Fuentes autorizadas
       |                    |
       +----------+---------+
                  |
                  v
       Contenido estructurado
                  |
                  v
            Power Automate
                  |
                  v
       Plantilla y documento Word
                  |
                  v
              SharePoint
                  |
                  v

**CONSEIN**  
Inteligencia competitiva, automatización y soluciones empresariales sobre el ecosistema Microsoft.