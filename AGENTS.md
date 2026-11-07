# AGENTS.md — Frontend de ReservaX

## 1. Propósito y alcance

ReservaX es un sistema académico de reservas de espacios y equipos para
Programación III del ITLA. El frontend será una aplicación independiente en
React y TypeScript que consume la API existente de ASP.NET Core .NET 10.

Antigravity trabaja en el frontend. OpenCode trabaja en el backend.
La separación entre ambos se sostiene mediante el contrato HTTP.

Este archivo debe ubicarse en la raíz del frontend (por ejemplo,
`frontend/AGENTS.md`). No sustituye el `AGENTS.md` de la raíz del repositorio.
Respeta las instrucciones generales y las específicas del directorio.

## 2. Fuentes de verdad

Antes de implementar, consultar:

1. La tarea y las decisiones explícitas del usuario.
2. Los PDF oficiales correspondientes a la entrega y
   `docs/requerimientos-core.md`, contrastando diferencias con el PDF.
3. Los Controllers, modelos de petición y respuestas reales de la API.
4. `docs/contrato-negocio.md`, `docs/maquina-de-estados.md`,
   `docs/gestion-permisos.md` y `docs/matriz-requisitos.md`.
5. Este archivo y las convenciones existentes del frontend.

No inventar requisitos, endpoints, propiedades ni permisos.
Si documentación y código difieren, registrar la discrepancia; no cambiar
silenciosamente el significado del requisito ni declarar terminado el flujo.
Usar identificadores RD-XX y RF-XX en tareas y evidencia cuando corresponda.

## 3. Base conocida y verificación inicial

Esta guía parte del RAR revisado en esta conversación. No afirma que ese
archivo represente el último estado de la rama local o remota.

La base revisada contiene los proyectos Core, Business, Infrastructure,
API y Tests. Usa EF Core y SQL Server. No incluye un frontend implementado.

Disponible en esa base:

- Registro, activación y reenvío de activación.
- Inicio/cierre de sesión y consulta del usuario autenticado.
- Recuperación y cambio de contraseña.
- Administración de usuarios: listado, rol, estado y solicitud de reset.
- Solicitudes de permisos: creación, consulta propia, pendientes y resolución.
- Reservas: creación, consulta propia, gestión y transiciones.
- Cola de correos, procesamiento y consulta administrativa.

Pendiente en esa base:

- Catálogo persistido de espacios y equipos.
- Manejador de documentos.
- Bandeja de notificaciones internas y preferencias de correo.
- Reportes agregados y auditoría.
- Completar las cuatro entidades relacionadas del negocio (RF-NEG-01).

La cola de correos no equivale a una bandeja de notificaciones.
El README reporta 454 casos aprobados; esta cifra es evidencia histórica,
no resultado de una ejecución actual. Verificar antes de repetirla como tal.

Al empezar cada tarea, revisar rama, cambios locales y contrato vigente.
No borrar ni sobrescribir trabajo ajeno para obtener un árbol limpio.

## 4. Responsabilidades y límites

### Antigravity: frontend

- Pantallas, componentes, navegación y estilos.
- Integración HTTP, formularios y validación para facilitar el uso.
- Presentación de estados, errores y acciones según la sesión.
- Accesibilidad, adaptación móvil y pruebas del alcance implementado.

### OpenCode: backend

- Entidades, persistencia, migraciones y reglas de negocio.
- Autenticación, autorización, disponibilidad y transiciones.
- Cambios de endpoints, DTOs y configuración del servidor.

No modificar el backend para acomodar una pantalla sin una tarea explícita.
Si falta una capacidad, describir la necesidad, el contrato esperado y el
flujo bloqueado para que se atienda en backend. Continuar el trabajo de
frontend que no dependa de ella.
No conectar el navegador directamente a SQL Server.

## 5. Tecnología y organización

React y TypeScript son la base acordada para este frontend.
Antes de inicializarlo, comprobar si ya existe una aplicación y reutilizar
sus herramientas, gestor de paquetes, lockfile y convenciones.
Si aún no existe, proponer una configuración mínima y explicitar las
herramientas adicionales elegidas; no tratarlas como decisiones ya acordadas.

Organización inicial sugerida, adaptable a la estructura existente:

- `src/app/`: arranque, rutas y proveedores compartidos.
- `src/features/auth/`: acceso y recuperación de cuenta.
- `src/features/reservas/`: creación y seguimiento de reservas.
- `src/features/permisos/`: solicitudes y resolución.
- `src/features/usuarios/`: administración de usuarios.
- `src/features/correos/`: consulta administrativa de la cola.
- `src/shared/api/`: cliente HTTP y tratamiento común de errores.
- `src/shared/ui/`: componentes reutilizables de presentación.
- `src/shared/config/`: configuración pública y validada.

No colocar llamadas HTTP dispersas en los componentes visuales.
Definir tipos que correspondan a los JSON reales. TypeScript no valida
por sí solo los datos recibidos durante la ejecución.
Evitar `any` sin justificación y dependencias que no resuelvan una necesidad.
No crear abstracciones, sistemas de estado o capas adicionales por anticipación.

## 6. Contrato HTTP de referencia

Confirmar rutas, campos y respuestas en la API antes de utilizarlos.
Los roles son Administrador y Estándar; el valor técnico de este último
puede ser `Estandar`. Respetar los valores realmente serializados.

| Método y ruta | Uso | Acceso |
| --- | --- | --- |
| POST `/api/usuarios` | Registro | Público |
| GET `/activar?token=...` | Activación | Público |
| POST `/activar/reenviar` | Reenviar activación | Público |
| POST `/api/sesiones` | Iniciar sesión | Público |
| DELETE `/api/sesiones` | Cerrar sesión | Autenticado |
| GET `/api/usuarios/yo` | Consultar identidad y rol | Autenticado |
| PUT `/api/usuarios/yo/contrasena` | Cambiar contraseña propia | Autenticado |
| POST `/api/recuperacion-contrasena` | Solicitar recuperación | Público |
| POST `/api/recuperacion-contrasena/cambio` | Canjear código | Público |
| GET `/api/usuarios` | Listar usuarios | Administrador |
| PUT `/api/usuarios/{id}/rol` | Cambiar rol | Administrador |
| PUT `/api/usuarios/{id}/estado` | Cambiar estado | Administrador |
| PUT `/api/usuarios/{id}/contrasena` | Solicitar reset forzado | Administrador |
| POST `/api/solicitudes-permisos` | Solicitar permiso | Autenticado |
| GET `/api/solicitudes-permisos/mias` | Consultar propias | Autenticado |
| GET `/api/solicitudes-permisos/pendientes` | Consultar pendientes | Administrador |
| PUT `/api/solicitudes-permisos/{id}/aprobar` | Aprobar y aplicar | Administrador |
| PUT `/api/solicitudes-permisos/{id}/rechazar` | Rechazar con motivo | Administrador |
| POST `/api/reservas` | Crear reserva | Autenticado con permiso |
| GET `/api/reservas/mias` | Consultar propias | Autenticado |
| GET `/api/reservas` | Consultar para gestión | Administrador |
| PUT `/api/reservas/{id}/confirmar` | Confirmar | Administrador |
| PUT `/api/reservas/{id}/rechazar` | Rechazar | Administrador |
| PUT `/api/reservas/{id}/cancelar` | Cancelar | Propietario o Administrador |
| PUT `/api/reservas/{id}/finalizar` | Finalizar | Administrador |
| GET `/api/correos` | Consultar cola | Administrador |

El login devuelve `token` y `vencimiento`; consultar `/api/usuarios/yo`
para obtener la identidad y el rol. Es un token opaco, no asumir JWT.
Las llamadas protegidas utilizan `Authorization: Bearer <token>`.
Los nombres JSON pueden contener `ñ` (por ejemplo, `contraseña`);
no renombrarlos sin un adaptador explícito y comprobado.

## 7. Sesión y seguridad

La persistencia de sesión todavía requiere una decisión técnica explícita.
No guardar tokens por defecto en localStorage, IndexedDB o cookies legibles
por JavaScript. Si el trabajo necesita persistencia, presentar las opciones
y dependencias de backend antes de implementarla. No fingir que una cookie
HttpOnly puede configurarse únicamente desde React.

- La identidad y el rol se obtienen del servidor.
- Las rutas protegidas mejoran la experiencia; no sustituyen RD-06.
- El servidor decide la autorización en cada operación.
- Ante un 401 en una llamada protegida, limpiar la sesión del cliente y
  solicitar acceso nuevamente. Un 401 en login es un error de credenciales.
- Un 403 no significa necesariamente sesión vencida: mostrar el rechazo.
- Cerrar sesión mediante la API y limpiar el estado sensible del cliente;
  manejar explícitamente un fallo de revocación sin afirmar éxito remoto.
- No registrar tokens, contraseñas, códigos ni enlaces de recuperación.
- Las variables incluidas en el bundle del navegador son públicas:
  nunca colocar allí credenciales, claves privadas ni cadenas de conexión.
- No renderizar HTML externo sin una necesidad y tratamiento explícitos.
- Configurar origen de API; si hay orígenes distintos, coordinar CORS con
  backend. No intentar resolverlo usando `no-cors` ni desactivando seguridad.

## 8. Reglas para permisos y reservas

El catálogo actual contiene `CrearReserva`. El Administrador tiene el
permiso implícito en la implementación revisada. No inventar otros permisos.
`/api/usuarios/yo` no expone el catálogo de permisos otorgados; no asumirlo.

Una solicitud de permiso nace Pendiente. Aprobar aplica el permiso y deja
el estado final Aplicada. Rechazar exige motivo. Nadie resuelve su propia
solicitud. La máquina de permisos es independiente de la de reservas.

Transiciones de reserva conocidas:

| Desde | Acción / destino | Quién |
| --- | --- | --- |
| Solicitada | Confirmar / Confirmada | Administrador |
| Solicitada | Rechazar / Rechazada | Administrador |
| Solicitada | Cancelar / Cancelada | Propietario o Administrador |
| Confirmada | Finalizar / Finalizada | Administrador |
| Confirmada | Cancelar / Cancelada | Propietario o Administrador |

Rechazada, Cancelada y Finalizada son terminales.
La interfaz presenta las acciones pertinentes; el backend conserva la
validación definitiva. No trasladar el motor de transiciones a React.
Después de una acción, actualizar con la respuesta del servidor o recargar
el recurso. Manejar conflictos si otra sesión cambió el estado.

Para crear reserva se envían `espacio`, `fecha`, `horaInicio` y `horaFin`.
No enviar propietario, rol, estado inicial o fecha de creación como autoridad.
En la base actual, `espacio` es texto; no simular un catálogo real.
No existe una consulta pública de disponibilidad: un calendario construido
solo con reservas propias no prueba que un horario esté libre.
El servidor comprueba conflictos al crear; manejar 409 y 503 por separado.
No agregar restricciones nuevas, como prohibir fechas pasadas, sin requisito.

## 9. Limitaciones detectadas que el frontend no debe ocultar

- RF-CA-13: el reset administrativo revisado genera y encola un código,
  pero no invalida por sí mismo la contraseña anterior. No anunciar que
  bloqueó inmediatamente el acceso. También falta la auditoría exigida.
- El listado de solicitudes revisado no devuelve motivo de rechazo,
  resolutor ni fecha de resolución. Solicitar ampliación si la pantalla
  necesita esos datos; no inventarlos ni mostrarlos como vacíos definitivos.
- Sin SMTP configurado, los correos se escriben como `.eml` en el servidor.
  Un mensaje encolado no demuestra recepción en el buzón del destinatario.
- Las funcionalidades pendientes no deben aparecer como terminadas.
  Los mocks solo se usan de forma explícita y separada de la integración real.

## 10. Experiencia de usuario y presentación

- Interfaz en español, con terminología coherente: reserva y solicitud de
  permiso son conceptos diferentes.
- Formularios con etiquetas, mensajes asociados y navegación por teclado.
- Diseño adaptable a móvil y escritorio; foco visible y contraste legible.
- Cada consulta contempla carga, vacío, éxito y error.
- Cada envío muestra progreso y evita dobles envíos accidentales.
- Pedir confirmación para acciones sensibles, especialmente cancelar,
  rechazar, cambiar roles, desactivar y forzar restablecimiento.
- Mostrar errores comprensibles sin trazas, SQL ni rutas internas.
- Manejar respuestas `{ mensaje }`, errores de validación y fallos de red;
  no asumir que todas las respuestas son JSON o tienen la misma forma.
- Tratar fecha y horario de reserva como valores de calendario, evitando
  desplazamientos por convertir una fecha sin zona en un instante UTC.
  Mostrar los instantes de registro UTC en America/Santo_Domingo.
- No afirmar paginación o filtros del servidor si solo existen en el cliente.

## 11. Flujo de trabajo y Git

Antes de cambios relevantes:

1. Revisar instrucciones, rama y estado de trabajo.
2. Leer el contrato y los requisitos del alcance.
3. Identificar archivos afectados y explicar el enfoque brevemente.
4. Implementar una tarea acotada siguiendo las convenciones existentes.
5. Verificar funcionalidad, integración y presentación.
6. Entregar cambios y evidencia para revisión.

Trabajar en ramas `feature/frontend-<alcance>` o según indique la tarea.
No cambiar de rama con trabajo ajeno sin resolver su preservación.
No hacer commits, push, PR ni merge salvo autorización del usuario.
Los PR son manuales por defecto y requieren QA antes del merge.

Si se autorizan commits, usar asuntos imperativos, descriptivos y de hasta
50 caracteres, con un cambio coherente por commit.
La descripción del PR explica qué cambia, por qué, cómo probarlo y qué
queda fuera. No mezclar rediseños y cambios funcionales independientes.

## 12. Verificación y definición de terminado

Usar los scripts reales del proyecto para comprobar tipos, lint, pruebas y
build; no inventar comandos ni afirmar que se ejecutaron si no fue así.
Agregar pruebas de comportamiento para lógica de integración o flujos
relevantes; evitar pruebas que solo repitan la implementación.

Para acceso, permisos y reservas, comprobar según el alcance:

- Éxito, validación, rechazo por rol, sesión vencida y fallo de red.
- Respuesta 409 por conflicto y 503 cuando corresponda.
- Aislamiento entre usuarios y acciones administrativas.
- Navegación directa y recarga de rutas.
- Uso en móvil y con teclado.
- Recorrido real: registro → activación → login → solicitud de permiso →
  aprobación por otra cuenta → reserva → gestión de su estado.

Una pantalla con datos simulados no equivale a integración terminada.
No declarar cumplido un requisito solo porque el frontend compile.

Cada entrega informa:

- Qué cambió y qué archivos se tocaron.
- Qué verificaciones se ejecutaron y sus resultados reales.
- Qué depende del backend o de una decisión pendiente.
- Cómo reproducir la prueba manual.

## 13. Primera tarea sugerida

Inspeccionar el repositorio y preparar la estructura mínima del frontend,
el layout compartido y el cliente HTTP. Verificar el contrato de acceso y
acordar el manejo de sesión antes de completar login y rutas protegidas.
Continuar después con permisos y reservas. No implementar todas las piezas
del Core en una sola tarea ni ampliar el backend sin encargo explícito.
