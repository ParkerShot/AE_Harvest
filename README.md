# AE Harvest

[RU](#ae-harvest--риг-сбора-ресурсов-для-after-effects) · [EN](#ae-harvest--resource-harvest-rig-for-after-effects)

`v1.0`

---

## AE Harvest — риг сбора ресурсов для After Effects

Панель для After Effects: монеты летят по дуге из точки-эмиттера в бар ресурса (или из бара наружу при трате), вокруг бара вспыхивает светящийся контур — зелёный на сборе, красный на трате, — счётчик тикает.

Главное: **вся геометрия на выражениях**. Меняете размер композиции (1920×1920 → 1080×1920 → 1080×1350) — бар сам примагничивается к своему углу, точка прилёта едет за баром, точка вылета — за своим якорем. Руками ничего не двигаете.

### Установка

**Windows:** закрыть AE → двойной клик по **`install.bat`** → подтвердить права администратора. Установщик сам найдёт все установленные версии AE и положит скрипт в `ScriptUI Panels`, перезаписав старую версию. Затем `Window → AE_Harvest_Panel.jsx`.

**Вручную / macOS:** скопировать `AE_Harvest_Panel.jsx` в папку скриптов AE:

```
Windows: C:\Program Files\Adobe\Adobe After Effects <версия>\Support Files\Scripts\ScriptUI Panels\
macOS:   /Applications/Adobe After Effects <версия>/Scripts/ScriptUI Panels/
```

**Без установки:** `File → Scripts → Run Script File...` — панель откроется плавающим окном.

> AE читает скрипты **при запуске**. После обновления файла — перезапуск.

### Сборка рига

Кнопки по порядку:

1. **Create / update controller** — создаёт три нулла: `AEH_CTRL` (всё про полёт монет), `AEH_BAR_CTRL` (всё про сам бар и его кольцо) и `AEH_SETUP` (настройка «один раз и забыл»: якоря точек A/Б; shy + guide, спрятан). Повторный клик безопасен: добавляет только недостающее и переносит значения при переименовании параметров, ваши настройки не сбрасывает.
2. Выделить слой бара → **Selected layer → BAR (magnet + glow)**. Слой станет `AEH_BAR`, получит магнит-позицию и пульс. Появятся `AEH_EMIT` (точка A), `AEH_COLLECT` (точка Б, приклеена к бару) и `AEH_GLOW` (светящееся кольцо). Если рой монет уже собран — пересоберётся автоматически.
3. Выделить слой монеты → **Selected layer → coins (build / rebuild)**. Оригинал спрячется как `AEH_COIN_SRC`, появятся дубли `AEH_COIN_1..N`. Без выделения — пересобирает по текущему `AEH_COIN_SRC`. Количество живых монет в конкретном залпе — слайдер `Coins` на `AEH_CTRL`; физический пул делается по максимуму его значения на всех маркерах, но не меньше **60** — так поднять `Coins` позже можно без пересборки.
4. **Link SELECTED text → counter** — выделите свой текстовый слой (уже стилизованный — иконка, шрифт, фон, что угодно) и нажмите. Вид сохранится, изменится только источник числа; текущее число подхватится как `Counter Start`. Работает и когда текст лежит во вложенном прекомпе, и когда `AEH_CTRL` находится в другой композиции.

### Запуск полётов — маркеры

Каждый маркер на `AEH_CTRL` = один залп. Комментарий маркера — сумма:

- `+100` (или `100`) — **сбор**: монеты летят A → бар, кольцо зелёное, счётчик +100;
- `-50` — **трата**: монеты летят бар → A, кольцо красное, счётчик −50.

Кнопки `+ GAIN` / `− SPEND` ставят маркер на текущем времени и спрашивают сумму. Пустой/нечисловой комментарий = 100.

Счётчик прибавляет по частям — по монете за прилёт (при трате списывает в момент вылета).

### Параметры на AEH_CTRL — полёт монет

| Контрол | Что делает |
|---|---|
| Coins | монет в залпе. **Анимируется** — читается на момент маркера, поэтому залпы могут быть разной мощности |
| Counter Start | первоначальное число счётчика |
| Flight Time | длительность полёта монеты, сек (= скорость) |
| Arc Height | высота дуги; минус — выгнуть в другую сторону |
| Start/End Scale | на скольких % пути монета вырастает из нуля (и гаснет в конце) |
| Coin Scale | максимальный масштаб монеты |
| Coin Spacing | 0 = монеты растянуты по всему залпу тонкой цепочкой, 100 = почти одновременный залп |
| Coin Glow | сила свечения монеты (эмиссив), 0 = без свечения |
| Coin Glow Radius | насколько широко это свечение размывается наружу |
| Coin Glow Color | цвет свечения — фиксированный, не берётся из цвета самой монеты (иначе подхватывалась бы, например, чёрная обводка артворка) |
| Swarm Mode | выключен по умолчанию — монеты летят одной линией. Включив, `Swarm Spread`/`Swarm Chaos` начинают рассыпать тот же путь в облако |
| Swarm Spread | ширина рассыпания роя в стороны от дуги |
| Swarm Chaos | неровность/асимметрия рассыпания |

### Параметры на AEH_BAR_CTRL — сам бар и кольцо

| Контрол | Что делает |
|---|---|
| Bar Scale | размер самого бара, %; магнит и кольцо подстраиваются сами |
| Bar Offset (X,Y) | сдвиг бара **внутрь** от прижатого положения (для любого угла) |
| Bar Anchor (1..9) | магнит бара: угол / край / центр композиции |
| Glow Width | толщина кольца |
| Glow Roundness | внешнее скругление кольца |
| Glow Inner Roundness | внутреннее скругление кольца |
| Glow Blur | размытие кольца |
| Glow Scale (X,Y) | подгонка размера кольца под бокс бара; минус = плотнее к бару |
| Glow Offset (X,Y) | сдвиг кольца (если бокс несимметричен из-за иконки) |
| Glow Int | сила вспышки при сборе/трате. Выше ~100 кольцо уже полностью непрозрачно — дальше крутить продолжает добавлять реальный «перегрев» (экспозиция), а не упирается в потолок |

Пульс (сила/длительность) и цвета кольца (белый в покое, зелёный на сборе, красный на трате) фиксированы и не настраиваются намеренно — бар должен однозначно читаться.

### Точки A и Б — свободные

`AEH_EMIT` (точка A) и `AEH_COLLECT` (точка Б) — обычные нуллы **без выражений**: таскайте мышкой, ставьте кейфреймы, анимируйте.

Привязку держат скрытые родители: `AEH_EMIT_ANCHOR` (к якорю композиции) и `AEH_COLLECT_ANCHOR` (к боксу бара). Поэтому ресайз композиции точки не ломает, а ручная анимация остаётся. Родителей трогать не нужно.

На трате направление разворачивается само: `AEH_COLLECT` → `AEH_EMIT`.

### Время полёта не зависит от расстояния

`Flight Time` — длительность, а не скорость. При смене размера композиции путь становится короче или длиннее, но монета проходит его за **то же число секунд**, так что тайминг во всех кропах одинаковый.

### Параметры на AEH_SETUP (настроил и забыл)

Нулл `AEH_SETUP` — shy. Чтобы добраться: включите переключатель **Shy** в шапке таймлайна.

Якоря — **слайдеры 1..9** (сетка 3×3 слева направо: 1 — верх-лево, 5 — центр, 9 — низ-право). Дропдаунов нет намеренно: их `setPropertyParameters` молча ломается на части сборок AE.

| Контрол | Что делает |
|---|---|
| Emitter Anchor (1..9) + Emitter Offset | к чему привязана точка A при ресайзе |
| Collect Anchor (1..9) + Collect Offset | магнит точки прилёта по боксу бара (`4` — в иконку слева) + сдвиг |

### Ресайз композиции

Меняете размер — бар примагничивается к якорю с теми же отступами, точка Б следует за баром, точка A — за своим якорем. Кольцо тянется по боксу бара.

### Ограничения

- Слои рига не переименовывать: выражения ссылаются на имена `AEH_*`.
- Слои должны быть 2D, без разделённых измерений Position.
- `AEH_EMIT` парентится к `AEH_EMIT_ANCHOR`, поэтому его `transform.position` — координата относительно родителя. В выражениях точки читаются через `toComp()`.
- Шлейф монет считается автоматически из `Flight Time` и `Coin Spacing` — отдельной ручки на длину нет.
- Кольцо строится по **боксу** бара. Если бар — прекомп, бокс покрывает всё его содержимое (торчащая иконка расширяет его) — подгоняется через `Glow Scale` / `Glow Offset`.
- Дропдауны требуют AE 17.0.1+ (2020); на старее — слайдеры 1–9 в том же порядке якорей.
- Свечение монет и «перегрев» кольца используют встроенные эффекты AE (`Glow`, `Exposure`) — на некоторых урезанных сборках AE конкретное имя эффекта может быть недоступно; в этом случае свечение просто не появляется, остальной риг не ломается.

---

Сделал Tim Parker вместе с погибелью человечества — [t.me/parkershot](https://t.me/parkershot)

---

## AE Harvest — resource harvest rig for After Effects

A panel for After Effects: coins fly along an arc from an emitter point into a resource bar (or out of it when spending), a glowing ring lights up around the bar — green on gain, red on spend — and a counter ticks.

The core idea: **all the geometry is expression-driven**. Resize the comp (1920×1920 → 1080×1920 → 1080×1350) and the bar snaps to its own corner, the collect point follows the bar, the emitter point follows its own anchor. Nothing needs to be moved by hand.

### Installation

**Windows:** close AE → double-click **`install.bat`** → confirm admin rights. The installer finds every installed AE version and drops the script into `ScriptUI Panels`, overwriting any older copy. Then `Window → AE_Harvest_Panel.jsx`.

**Manual / macOS:** copy `AE_Harvest_Panel.jsx` into AE's scripts folder:

```
Windows: C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\
macOS:   /Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/
```

**Without installing:** `File → Scripts → Run Script File...` — the panel opens as a floating window.

> AE reads scripts **at launch**. Restart after updating the file.

### Building the rig

Buttons, in order:

1. **Create / update controller** — creates three nulls: `AEH_CTRL` (everything about coin flight), `AEH_BAR_CTRL` (everything about the bar and its ring), and `AEH_SETUP` (set-once-and-forget: point anchors; shy + guide, hidden). Safe to re-run: only adds what's missing and migrates values on renamed parameters, never resets your tuning.
2. Select the bar layer → **Selected layer → BAR (magnet + glow)**. The layer becomes `AEH_BAR`, gets magnet positioning and a pulse. `AEH_EMIT` (point A), `AEH_COLLECT` (point B, stuck to the bar) and `AEH_GLOW` (the glowing ring) appear. If a coin swarm already exists, it's rebuilt automatically.
3. Select the coin layer → **Selected layer → coins (build / rebuild)**. The original hides as `AEH_COIN_SRC`, duplicates `AEH_COIN_1..N` appear. With nothing selected, it rebuilds from the current `AEH_COIN_SRC`. How many coins are live in a given burst is the `Coins` slider on `AEH_CTRL`; the physical pool is sized to the highest value it hits across all markers, but never less than **60** — so raising `Coins` later works without a rebuild.
4. **Link SELECTED text → counter** — select your own text layer (already styled — icon, font, background, whatever) and click. The look stays, only the number's source changes; its current value is picked up as `Counter Start`. Works even when the text sits in a nested precomp, or when `AEH_CTRL` lives in a different comp.

### Triggering flights — markers

Every marker on `AEH_CTRL` is one burst. The marker's comment is the amount:

- `+100` (or `100`) — **gain**: coins fly A → bar, ring green, counter +100;
- `-50` — **spend**: coins fly bar → A, ring red, counter −50.

The `+ GAIN` / `− SPEND` buttons drop a marker at the current time and ask for an amount. An empty or non-numeric comment defaults to 100.

The counter increments in pieces — one coin per landing (on a spend, it's deducted the moment the coin leaves).

### AEH_CTRL parameters — coin flight

| Control | What it does |
|---|---|
| Coins | coins per burst. **Animatable** — sampled at the marker's time, so bursts can vary in size |
| Counter Start | the counter's starting number |
| Flight Time | coin flight duration, seconds (= speed) |
| Arc Height | arc height; negative bows the other way |
| Start/End Scale | what % of the path the coin grows in from zero (and shrinks out at the end) |
| Coin Scale | the coin's peak scale |
| Coin Spacing | 0 = coins spread thin across the whole burst, 100 = a near-simultaneous burst |
| Coin Glow | coin glow strength (emissive), 0 = no glow |
| Coin Glow Radius | how far that glow blurs outward |
| Coin Glow Color | glow colour — fixed, not sampled from the coin artwork itself (which could pick up something like a black outline instead of the fill) |
| Swarm Mode | off by default — coins fly a single line. Turn it on and `Swarm Spread`/`Swarm Chaos` scatter that same path into a cloud |
| Swarm Spread | how wide the swarm scatters sideways off the arc |
| Swarm Chaos | how uneven/asymmetric the scatter is |

### AEH_BAR_CTRL parameters — the bar & ring

| Control | What it does |
|---|---|
| Bar Scale | the bar's own size, %; the magnet and ring adjust themselves |
| Bar Offset (X,Y) | shifts the bar **inward** from its snapped position (for any corner) |
| Bar Anchor (1..9) | the bar's magnet: which comp corner / edge / centre |
| Glow Width | ring thickness |
| Glow Roundness | outer ring rounding |
| Glow Inner Roundness | inner ring rounding |
| Glow Blur | ring blur |
| Glow Scale (X,Y) | fits the ring to the bar's box; negative = tighter |
| Glow Offset (X,Y) | shifts the ring (if the box is asymmetric because of an icon) |
| Glow Int | flash strength on gain/spend. Past ~100 the ring is already fully opaque — turning it up further keeps adding real "overdrive" (exposure) instead of hitting a ceiling |

The pulse (strength/duration) and the ring's colours (white at rest, green on gain, red on spend) are fixed on purpose and not exposed — the bar should read unambiguously.

### Free points A and B

`AEH_EMIT` (point A) and `AEH_COLLECT` (point B) are plain nulls **with no expressions**: drag them, keyframe them, animate them freely.

Hidden parents hold the anchoring: `AEH_EMIT_ANCHOR` (to a comp anchor) and `AEH_COLLECT_ANCHOR` (to the bar's box). So resizing the comp never breaks the points, and hand animation survives. Leave the parents alone.

On a spend, the direction reverses automatically: `AEH_COLLECT` → `AEH_EMIT`.

### Flight time doesn't depend on distance

`Flight Time` is a duration, not a speed. Resizing the comp makes the path shorter or longer, but a coin still covers it in **the same number of seconds** — so timing matches across every crop.

### AEH_SETUP parameters (set once and forget)

The `AEH_SETUP` null is shy. To reach it: toggle **Shy** in the timeline header.

Anchors are **1..9 sliders** (a 3×3 grid, left to right: 1 top-left, 5 centre, 9 bottom-right). No dropdowns on purpose — their `setPropertyParameters` silently breaks on some AE builds.

| Control | What it does |
|---|---|
| Emitter Anchor (1..9) + Emitter Offset | what point A anchors to on resize |
| Collect Anchor (1..9) + Collect Offset | the landing point's magnet on the bar's box (`4` — into an icon on the left) + offset |

### Resizing the comp

Resize it and the bar re-magnets to its anchor with the same margins, point B follows the bar, point A follows its own anchor. The ring stretches to fit the bar's box.

### Limitations

- Don't rename rig layers: expressions reference the `AEH_*` names directly.
- Layers must be 2D, with Position dimensions not separated.
- `AEH_EMIT` is parented to `AEH_EMIT_ANCHOR`, so its `transform.position` is relative to that parent. Expressions read the points through `toComp()`.
- Coin trail spacing is derived automatically from `Flight Time` and `Coin Spacing` — there's no separate length control.
- The ring is built from the bar's **box**. If the bar is a precomp, the box covers all of its content (a poking-out icon widens it) — adjust with `Glow Scale` / `Glow Offset`.
- Dropdowns need AE 17.0.1+ (2020); on older versions, 1–9 sliders in the same anchor order.
- Coin glow and the ring's "overdrive" use AE's built-in effects (`Glow`, `Exposure`) — on some trimmed-down AE installs the exact effect may be unavailable; in that case the glow just doesn't appear, the rest of the rig keeps working.
