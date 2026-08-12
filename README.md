# Leitner IA | Inteligencia competitiva para Battlecards accionables

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
  Enlace de descarga e historial web
```

El diagrama representa responsabilidades lógicas. Los recursos, nombres y conexiones exactas dependen del ambiente configurado.

## Tecnologías

### Frontend

- React.
- TypeScript.
- Vite.
- Lucide React para iconografía.
- Interfaz adaptable para inicio, agente, historial y detalle de Battlecards.

### Backend

- API en .NET.
- Integración con identidad empresarial y servicios de Azure.
- Comunicación entre la aplicación web y el agente.

### Microsoft Foundry

Aloja y ejecuta el agente encargado de interpretar el contexto, razonar sobre la comparación e invocar las herramientas configuradas.

### Modelos de lenguaje

El modelo configurado en Foundry genera y estructura el análisis. La interfaz presenta GPT-5 como parte del stack previsto, pero el modelo efectivo depende de la configuración del entorno.

### Model Context Protocol

MCP permite exponer herramientas especializadas al agente mediante contratos desacoplados. Puede utilizarse para investigación, consulta de conocimiento o generación documental sin incorporar todas las integraciones directamente en el frontend.

### Power Automate

Orquesta la creación del archivo, la aplicación de plantillas, el almacenamiento y la devolución del enlace de descarga.

### Microsoft Word

Funciona como formato documental para producir Battlecards consistentes y listas para revisión o uso comercial.

### SharePoint

Almacena Battlecards y activos documentales, y puede participar en el gobierno, versionado y acceso a los documentos generados.

### Microsoft Entra ID

Proporciona autenticación empresarial y puede utilizarse para proteger el acceso a la aplicación y los recursos relacionados.

### Azure Container Apps y Azure Developer CLI

El repositorio base contempla infraestructura y automatización para desplegar la aplicación mediante contenedores y `azd`.

## Experiencia web

La aplicación contempla las siguientes áreas:

- **Inicio:** presenta la propuesta de valor, método, beneficios y tecnologías.
- **Agente:** recibe el contexto y guía la generación.
- **Battlecards recientes:** muestra resultados disponibles.
- **Detalle:** presenta la información principal y el acceso al documento.

La página de inicio comunica cinco beneficios:

1. Acelerar el análisis competitivo.
2. Estandarizar las Battlecards.
3. Reducir trabajo manual.
4. Organizar el análisis por empresa, servicio y solución.
5. Producir documentos accionables para ventas.

> Los indicadores visibles en una demostración, como tiempos promedio o cantidad de Battlecards, deben identificarse como datos de muestra hasta contar con telemetría real.

## Seguridad y uso responsable

- Utilizar únicamente fuentes públicas o conocimiento interno autorizado.
- No exponer credenciales, secretos ni contenido confidencial en prompts, logs o documentos.
- Diferenciar hechos verificables de inferencias y recomendaciones.
- Registrar las fuentes y fechas de consulta cuando la herramienta lo permita.
- Evitar afirmaciones difamatorias, especulativas o imposibles de comprobar sobre competidores.
- Tratar precios, certificaciones, alianzas y capacidades como información sensible al tiempo.
- Respetar permisos de SharePoint y acceso por identidad.
- Aplicar revisión humana antes de utilizar una Battlecard con un cliente.
- No presentar la salida del modelo como asesoría legal, financiera o contractual.

## Instalación y ejecución

### Requisitos generales

- Git.
- Node.js 18 o superior.
- .NET SDK compatible con el backend.
- PowerShell 7 o superior.
- Azure CLI.
- Azure Developer CLI.
- Acceso a un proyecto de Microsoft Foundry.

### Clonar el repositorio

```bash
git clone https://github.com/AngeloooG/foundry-agent-LeitnerIA.git
cd foundry-agent-LeitnerIA
```

### Desarrollo local

El repositorio separa `frontend` y `backend`. Valida los archivos de configuración vigentes antes de ejecutar comandos.

```bash
cd frontend
npm install
npm run dev
```

En otra terminal, inicia el backend con el proyecto .NET ubicado en `backend`:

```bash
cd backend
dotnet restore
dotnet run
```

De acuerdo con la plantilla de la aplicación, el frontend se expone normalmente en `http://localhost:5173` y el backend en `http://localhost:8080`. Estos puertos pueden cambiar según la configuración local.

### Configuración

No almacenes secretos reales en Git. Utiliza los archivos de ejemplo, secretos locales o variables de entorno para configurar:

- Proyecto y agente de Microsoft Foundry.
- Identidad de Microsoft Entra ID.
- URLs permitidas del frontend y backend.
- Herramientas MCP.
- Flujo de Power Automate.
- Ubicación autorizada de SharePoint.
- Telemetría y observabilidad.

Los nombres exactos deben obtenerse de los archivos de configuración del repositorio y del ambiente desplegado.

## Despliegue

El repositorio incluye archivos de infraestructura, despliegue y configuración de Azure Developer CLI.

```bash
azd auth login
azd up
```

Antes de desplegar:

1. Selecciona la suscripción y región correctas.
2. Verifica el registro de aplicación de Entra ID.
3. Configura el proyecto y agente de Foundry.
4. Revisa las asignaciones RBAC.
5. Configura las integraciones MCP, Power Automate y SharePoint.
6. Comprueba que ninguna credencial se encuentre versionada.

Para cambios posteriores, utiliza el flujo de despliegue definido por el repositorio y el ambiente de `azd`.

## Alcance del MVP

### Incluido

- Experiencia web para presentar y utilizar el agente.
- Captura de contexto competitivo.
- Análisis en tres capas.
- Generación estructurada de Battlecards.
- Automatización documental.
- Acceso a resultados recientes.
- Integración con el ecosistema Microsoft.

### No debe asumirse sin validación

- Exactitud absoluta de toda información competitiva.
- Acceso irrestricto a fuentes externas.
- Actualización automática de todos los datos.
- Cálculo real de métricas mostradas en la demo.
- Comparación exhaustiva de precios o contratos.
- Publicación de documentos sin revisión humana.
- Que una recomendación sea adecuada para todas las oportunidades.

## Documentación comercial

Consulta [`VENTAS.md`](./VENTAS.md) para revisar la propuesta comercial, casos de uso, beneficios, diferenciadores y estrategia de adopción.
