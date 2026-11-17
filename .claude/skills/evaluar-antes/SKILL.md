---
name: evaluar-antes
description: Úsala cada vez que Mauro pida un cambio, una función nueva o un arreglo en ATLAS que implique programar (interfaz, datos, Supabase, planos, Last Planner). Antes de escribir código, entrega una evaluación corta y un cuestionario en tarjetas para que él decida; programa solo cuando dé la orden («empieza», «hazlo», «programa»).
---

# Evaluar antes de programar

Mauro define cómo se ve y funciona ATLAS antes de que se construya, porque cada publicación es lenta y la app la usan en terreno. Por eso un pedido de código pasa primero por evaluación y cuestionario.

## 1. Entender lo que existe hoy

- Si hay que recorrer mucho código para saber cómo funciona hoy lo que se quiere cambiar, delega la búsqueda al agente `explorador` y trabaja con su resumen.
- Si la decisión depende del estado real de Supabase, usa el agente `verificador-supabase` (solo lectura, solo conteos).
- Lee las memorias relacionadas: las decisiones anteriores mandan sobre lo que propongas (colores Sacyr, teléfono para terreno y escritorio para oficina, sin pagos, marca ATLAS, etc.).

## 2. Evaluación (corta, en español)

En pocas líneas:
- **Qué hay hoy:** cómo funciona eso ahora, con rutas `archivo:línea` clicables.
- **Qué cambiaría:** qué partes se tocan y qué depende de ellas.
- **Riesgos:** funcionamiento sin conexión (`sw.js`, manifiesto), teléfono frente a escritorio (`data-oficina`), datos reales y permisos (RLS, roles), SQL que Mauro tendría que correr a mano.
- **Lo que no está claro** y hay que decidir.

## 3. Cuestionario en tarjetas

- Usa la herramienta AskUserQuestion; no escribas las preguntas como lista en el chat.
- Entre 1 y 4 preguntas, solo de decisiones que cambian lo que se programa. Lo que tiene una respuesta obvia lo decides tú y lo dices en una línea.
- La opción recomendada va primero, marcada «(Recomendado)».
- Cuando ayude, usa `preview` con un boceto o un ejemplo de pantalla.
- Cada pregunta se entiende sola: nombra la pantalla o el elemento del que hablas.

## 4. Esperar la orden

- Después del cuestionario resume lo decidido en 2 o 3 líneas y **no escribas código**.
- Se programa solo con una orden clara de Mauro: «empieza», «hazlo», «programa», «dale». Responder el cuestionario no es una orden para programar.
- Guarda las decisiones en la memoria del tema, con la fecha.

## Cuándo no aplica

- Preguntas, revisiones o consultas de estado: responde directo.
- Arreglos de una línea que Mauro ya dejó definidos, o cuando él diga explícitamente que lo hagas sin cuestionario.
