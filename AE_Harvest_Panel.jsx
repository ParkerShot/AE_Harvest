/*
    AE_Harvest_Panel.jsx
    --------------------
    Resource "harvest" rig for After Effects.

    Coins fly along an arc from an emitter point into a resource bar
    (or out of it, when spending). The bar pulses and a blurred glowing
    ring lights up around it (green on gain, red on spend).
    Everything is expression-driven and survives comp resizing:
      - the bar snaps ("magnets") to a chosen comp anchor (9-grid),
      - the collect point sticks to the bar,
      - the emitter point sticks to a comp anchor + offset.

    Three control nulls keep the UI clean:
      AEH_CTRL      - everything about the FLIGHT: coins, speed, arc, the
                       optional swarm scatter, and the counter's starting
                       number.
      AEH_BAR_CTRL  - everything about the BAR itself: its scale, position,
                       the glow ring's geometry. Pulse strength and colours
                       (green on gain, red on spend, white idle) are fixed
                       on purpose.
      AEH_SETUP     - set-once rig setup (anchors, offsets). guide + shy,
                       so it stays out of the way.

    Flights are triggered by MARKERS on the AEH_CTRL layer:
      marker comment "+100"  -> gain burst (green, value +100)
      marker comment "-50"   -> spend burst (red, coins fly out, value -50)

    Install: drop into
      C:\Program Files\Adobe\Adobe After Effects <ver>\Support Files\Scripts\ScriptUI Panels\
    then Window > AE_Harvest_Panel.jsx
*/

(function harvestPanel(thisObj) {

    var SCRIPT_NAME = "AE Harvest";

    // -------- layer names (expressions depend on these!) --------
    var N_CTRL    = "AEH_CTRL";
    var N_BARCTRL = "AEH_BAR_CTRL";
    var N_SETUP   = "AEH_SETUP";
    var N_BAR     = "AEH_BAR";
    var N_EMIT    = "AEH_EMIT";
    var N_EMITANC = "AEH_EMIT_ANCHOR"; // anchor-driven parent of AEH_EMIT
    var N_COLLECT = "AEH_COLLECT";
    var N_COLLANC = "AEH_COLLECT_ANCHOR"; // bar-driven parent of AEH_COLLECT
    var N_FLASH   = "AEH_FLASH";     // legacy name, removed on rebuild
    var N_GLOW    = "AEH_GLOW";      // blurred glowing ring around the bar
    var N_COIN    = "AEH_COIN_";     // prefix
    var N_COINSRC = "AEH_COIN_SRC";

    // Anchor sliders read 1..9 as a 3x3 grid, left-to-right, top-to-bottom:
    //   1 Top-Left      2 Top-Center      3 Top-Right
    //   4 Mid-Left      5 Center          6 Mid-Right
    //   7 Bottom-Left   8 Bottom-Center   9 Bottom-Right

    // delivery formats built by "Go Resize". Edit to taste.
    var SIZES = [[1080, 1080], [1080, 1350], [1080, 1920], [1920, 1080]];


    // ================= parameters & defaults =================
    // One table per null: type + display name. DEFAULTS holds the shipped
    // starting values, seeded once when a control is first created.

    // AEH_CTRL = FLIGHT: the coins' journey, start to finish, plus the
    // counter's starting number. Value per Burst is gone - +GAIN/-SPEND
    // always write an explicit amount into the marker, so a fallback was
    // only ever hit by a marker typed in by hand with no number; that case
    // now just uses 100.
    // Trimmed hard: Align Rotation, the Echo-based Coin Trail Length/Fade
    // (never read as a visible trail in practice), Coin Impact Flash, Swarm
    // Cohesion (felt identical to Chaos) and Swarm Mid Bulge (felt identical
    // to Coin Scale) are gone - fixed/removed rather than exposed. See
    // exCoinPosition/exCoinScale for what each used to do.
    var CTRL_PARAMS = [
        { t: "slider", n: "Coins" },
        { t: "slider", n: "Counter Start" }, // back on AEH_CTRL, right under Coins
        { t: "slider", n: "Flight Time" },
        { t: "slider", n: "Arc Height" },
        { t: "slider", n: "Start/End Scale" }, // was "Grow %"
        { t: "slider", n: "Coin Scale" },
        { t: "slider", n: "Coin Spacing" }, // was "Coin Trail Density"
        { t: "slider", n: "Coin Glow" }, // emissive glow intensity on the coin, 0 = untouched
        { t: "slider", n: "Coin Glow Radius" }, // how far that glow spreads/blurs outward
        { t: "color",  n: "Coin Glow Color" }, // fixed tint - Glow sampling the art's own colours
                                                // picks up a black outline as often as the fill
        // swarm: off by default, so every existing rig keeps flying the
        // single line it always has. Flip it on and Spread/Chaos start
        // scattering that same base arc into a cloud.
        { t: "check",  n: "Swarm Mode" },
        { t: "slider", n: "Swarm Spread" },
        { t: "slider", n: "Swarm Chaos" }
    ];

    // AEH_BAR_CTRL = BAR: how the bar itself looks and reacts, independent
    // of how the coins got there. Pulse Amount/Time and the three colours
    // are gone - fixed values baked into the expression (gain = green,
    // spend = red, always), not exposed. Glow Base is gone too: the ring is
    // fixed at zero idle glow now, invisible until a burst hits - it only
    // ever lights up via Glow Int.
    var BARCTRL_PARAMS = [
        { t: "slider", n: "Bar Scale" },
        { t: "point",  n: "Bar Offset" },
        { t: "anchor", n: "Bar Anchor" },  // moved from AEH_SETUP - you need this from day one, not just once
        { t: "slider", n: "Glow Width" },
        { t: "slider", n: "Glow Roundness" },
        { t: "slider", n: "Glow Inner Roundness" },
        { t: "slider", n: "Glow Blur" },    // was "Glow Radius" - it's blur softness, not a literal radius
        { t: "point",  n: "Glow Scale" },   // was "Glow Fit"
        { t: "point",  n: "Glow Offset" },  // was "Glow Shift"
        { t: "slider", n: "Glow Int" }      // was "Flash Amount" then "Flash Boost"
    ];

    // AEH_SETUP = genuinely set-once-and-forget: where the coins start from
    // and how they lock onto the bar. Bar Anchor/Offset moved out to
    // AEH_BAR_CTRL - unlike these, you need it on day one, every time.
    //
    // "anchor" = plain 1..9 slider (Top-Left .. Bottom-Right, reading rows
    // left-to-right). Deliberately NOT a Dropdown Menu Control: its
    // setPropertyParameters() silently fails on some AE builds, leaving a
    // 3-item menu behind -> "Value 5 out of range 1 to 3". A slider cannot.
    var SETUP_PARAMS = [
        { t: "anchor", n: "Emitter Anchor" },
        { t: "point",  n: "Emitter Offset" },
        { t: "anchor", n: "Collect Anchor" },
        { t: "point",  n: "Collect Offset" }
    ];

    var DEFAULTS = {
        // flight feel
        "Coins": 8,
        "Flight Time": 0.8,
        "Arc Height": 300,
        "Start/End Scale": 12,
        "Coin Scale": 100,
        "Coin Spacing": 65,
        "Coin Glow": 0,
        "Coin Glow Radius": 20,
        "Coin Glow Color": [1, 0.85, 0.15, 1],
        // swarm (off by default)
        "Swarm Mode": 0,
        "Swarm Spread": 150,
        "Swarm Chaos": 40,
        // bar feedback
        "Bar Scale": 141,
        "Bar Anchor": 3,      // Top-Right
        "Bar Offset": [-35, 33],
        // glow ring
        "Glow Width": 11,
        "Glow Roundness": 40,
        "Glow Inner Roundness": 37,
        "Glow Blur": 6,
        "Glow Scale": [-100, -29],
        "Glow Offset": [-36, 0],
        "Glow Int": 84,
        "Counter Start": 0,
        // setup
        "Emitter Anchor": 5,  // Center
        "Emitter Offset": [0, 0],
        "Collect Anchor": 5,  // Center of bar
        "Collect Offset": [0, 0]
    };

    var MATCH = {
        slider: "ADBE Slider Control",
        anchor: "ADBE Slider Control", // 1..9, see SETUP_PARAMS note
        point:  "ADBE Point Control",
        color:  "ADBE Color Control",
        check:  "ADBE Checkbox Control",
        menu:   "ADBE Dropdown Control" // legacy, only used to detect & migrate
    };

    // ================= helpers =================

    function getComp() {
        var c = app.project ? app.project.activeItem : null;
        if (!(c && c instanceof CompItem)) {
            alert(SCRIPT_NAME + ": open / select a composition first.");
            return null;
        }
        return c;
    }

    function findLayer(comp, name) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === name) return comp.layer(i);
        }
        return null;
    }

    function fxGroup(layer) { return layer.property("ADBE Effect Parade"); }
    function getFx(layer, name) {
        var g = fxGroup(layer);
        return g ? g.property(name) : null;
    }

    function removeFx(layer, names) {
        for (var i = 0; i < names.length; i++) {
            var f = getFx(layer, names[i]);
            if (f) { try { f.remove(); } catch (e) {} }
        }
    }

    // like fxGroup(layer).addProperty(matchName), but never throws: a wrong
    // or unavailable matchName just yields null instead of aborting whatever
    // build step called it (an effect this cosmetic should never block the
    // rest of the rig from getting built).
    function tryAddEffect(layer, matchName, displayName) {
        try {
            var p = fxGroup(layer).addProperty(matchName);
            p.name = displayName;
            return getFx(layer, displayName);
        } catch (e) {
            return null;
        }
    }

    // add one param if missing, seeded from DEFAULTS; never touches an
    // existing one, so user tweaks survive a re-run of step 1.
    function ensureParam(layer, spec) {
        var fx = getFx(layer, spec.n);
        if (fx) {
            // migrate anchors built by older versions as Dropdown Menu Control:
            // those can carry a broken 3-item menu, so rebuild them as sliders.
            if (spec.t === "anchor" && fx.matchName === MATCH.menu) {
                try { fx.remove(); } catch (e) { return fx; }
            } else {
                return fx;
            }
        }
        var dv = DEFAULTS[spec.n];
        fx = fxGroup(layer).addProperty(MATCH[spec.t] || MATCH.slider);
        fx.name = spec.n;
        fx = getFx(layer, spec.n);
        if (!fx) throw new Error("could not create the '" + spec.n + "' control");
        if (dv !== undefined && dv !== null) fx.property(1).setValue(dv);
        return fx;
    }

    function barRef(name) {
        return 'thisComp.layer("' + N_BARCTRL + '").effect("' + name + '")(1)';
    }

    // Sets an expression AND forces it on. The "Expression Enabled" toggle
    // (the small "=" next to a property) can end up off - accidentally
    // clicked while poking around, or left over from earlier troubleshooting
    // - which leaves the formula sitting there unevaluated: the property just
    // keeps its last static value, and turning a controller slider visibly
    // does nothing. Every (re)build should leave properties actually live.
    function setExpr(prop, expr) {
        prop.expression = expr;
        prop.expressionEnabled = true;
    }


    // ================= expressions =================
    // written for both engines (var only, no arrows).

    function exMarkerScan() {
        return [
            'var C = thisComp.layer("' + N_CTRL + '");',
            'var d = Math.max(0.05, C.effect("Flight Time")(1).value);',
            'var idx = effect("Coin Index")(1).value;',
            'var mk = C.marker;',
            'var mt = 0, amt = 0, found = false;',
            'for (var k = 1; k <= mk.numKeys; k++) {',
            '    if (mk.key(k).time <= time) {',
            '        mt = mk.key(k).time;',
            '        amt = parseFloat(mk.key(k).comment);',
            '        found = true;',
            '    } else { break; }',
            '}',
            'if (isNaN(amt) || amt == 0) amt = 100;', // fallback for a hand-typed marker with no number - +GAIN/-SPEND always write one
            'var spend = amt < 0;',
            // sampled AT THE MARKER, not at `time`: Coins is animatable, and
            // reading it live would pop coins in and out mid-flight.
            'var n = Math.max(1, Math.round(C.effect("Coins")(1).valueAtTime(mt)));',
            'var live = idx < n;',
            // Coin Spacing 0..100: 0 = spread thin across the whole flight
            // (coins strung far apart), 100 = nearly simultaneous burst
            // (coins bunched tight). Same mapping used everywhere spacing
            // is computed.
            'var trailD = C.effect("Coin Spacing")(1).value;',
            'var trailFrac = Math.max(0.05, 1 - (trailD/100)*0.9);',
            'var stag = d / n * trailFrac;',
            'var t0 = mt + idx * stag;',
            'var rawP = found ? clamp((time - t0) / d, 0, 1) : 0;',
            'var p = ease(rawP, 0, 1, 0, 1);'
        ].join("\n");
    }

    function exBezierPoints() {
        return [
            // toComp, not transform.position: AEH_EMIT is parented, so its
            // raw position is parent-relative and would land in the wrong place.
            'var EL = thisComp.layer("' + N_EMIT + '");',
            'var CL = thisComp.layer("' + N_COLLECT + '");',
            'var A = EL.toComp(EL.transform.anchorPoint);',
            'var B = CL.toComp(CL.transform.anchorPoint);',
            'var P0 = spend ? B : A;',
            'var P2 = spend ? A : B;',
            'var arc = C.effect("Arc Height")(1).value;',
            'var dv = [P2[0] - P0[0], P2[1] - P0[1]];',
            'var len = Math.sqrt(dv[0]*dv[0] + dv[1]*dv[1]);',
            'var perp = (len > 0) ? [-dv[1]/len, dv[0]/len] : [0, 0];',
            'var P1 = [(P0[0]+P2[0])/2 + perp[0]*arc, (P0[1]+P2[1])/2 + perp[1]*arc];'
        ].join("\n");
    }

    // Swarm scatter is added ON TOP of the same base arc, not a replacement
    // path: perpendicular offset per coin, enveloped by sin(PI*q) where
    // q = p^skewExp. Using an EXPONENT (not a multiplier) on p is what
    // guarantees the envelope is exactly 0 at p=0 and p=1 no matter what
    // Chaos does to skewExp - a multiplier-based version of this let some
    // coins arrive still carrying sideways offset, so they never quite
    // landed on the bar. Random per-coin side/magnitude/phase are seeded
    // from the coin's own index, so the shape is stable across scrubs and
    // renders, not re-rolled every frame.
    function exCoinPosition() {
        return exMarkerScan() + "\n" + exBezierPoints() + "\n" + [
            'var u = 1 - p;',
            'var bx = u*u*P0[0] + 2*u*p*P1[0] + p*p*P2[0];',
            'var by = u*u*P0[1] + 2*u*p*P1[1] + p*p*P2[1];',
            'if (C.effect("Swarm Mode")(1).value > 0.5) {',
            '    seedRandom(Math.round(idx) + 1, true);',
            '    var side = (random() < 0.5) ? -1 : 1;',
            '    var mag = random();', // was cohesion-biased; plain 0..1 now, one less knob
            '    var phaseN = random()*2 - 1;',
            '    var spread = C.effect("Swarm Spread")(1).value;',
            '    var chaos = C.effect("Swarm Chaos")(1).value;',
            '    var skewExp = Math.max(0.35, 1 + phaseN*(chaos/100)*0.9);',
            '    var q = Math.pow(Math.min(1, Math.max(0, p)), skewExp);',
            '    var env = Math.sin(Math.PI*q);',
            '    var off = side * mag * spread * env;',
            '    bx += perp[0]*off;',
            '    by += perp[1]*off;',
            '}',
            '[bx, by]'
        ].join("\n");
    }

    function exCoinScale() {
        return exMarkerScan() + "\n" + [
            'var g = clamp(C.effect("Start/End Scale")(1).value, 1, 49) / 100;',
            'var s = C.effect("Coin Scale")(1).value;',
            'var f = 0;',
            'if (rawP > 0 && rawP < 1) {',
            '    if (rawP < g) f = rawP / g;',
            '    else if (rawP > 1 - g) f = (1 - rawP) / g;',
            '    else f = 1;',
            '}',
            '[s*f, s*f]'
        ].join("\n");
    }

    function exCoinOpacity() {
        return exMarkerScan() + "\n" +
            '(found && live && rawP > 0 && rawP < 1) ? 100 : 0;';
    }

    // emissive bloom on the coin, tinted by Coin Glow Color (drives the real
    // Glow effect's intensity). Coin Glow 0 = no glow; higher = brighter halo.
    function exCoinGlow() {
        return 'thisComp.layer("' + N_CTRL + '").effect("Coin Glow")(1).value / 100 * 2';
    }

    function exCoinGlowColor() {
        return 'thisComp.layer("' + N_CTRL + '").effect("Coin Glow Color")(1).value';
    }

    // how far that glow spreads outward - AE's own default reads as barely
    // more than edge brightening, so this is exposed instead of guessed.
    function exCoinGlowRadius() {
        return 'thisComp.layer("' + N_CTRL + '").effect("Coin Glow Radius")(1).value';
    }

    // bar magnet: snap flush to one of 9 comp anchors, then Bar Offset nudges
    // it INWARD (positive = into the comp) whichever corner is used.
    function exBarPosition() {
        return [
            'var BC = thisComp.layer("' + N_BARCTRL + '");',
            'var a = clamp(Math.round(BC.effect("Bar Anchor")(1).value), 1, 9);',
            'var off = BC.effect("Bar Offset")(1).value;',
            'var r = sourceRectAtTime(time, false);',
            'var sx = Math.abs(transform.scale[0]) / 100;',
            'var sy = Math.abs(transform.scale[1]) / 100;',
            'var w = r.width * sx, h = r.height * sy;',
            'var ax = (transform.anchorPoint[0] - r.left) * sx;',
            'var ay = (transform.anchorPoint[1] - r.top) * sy;',
            'var col = (a - 1) % 3, row = Math.floor((a - 1) / 3);',
            'var fx = (col == 0) ? ax : ((col == 1) ? (thisComp.width - w)/2 + ax : thisComp.width - w + ax);',
            'var fy = (row == 0) ? ay : ((row == 1) ? (thisComp.height - h)/2 + ay : thisComp.height - h + ay);',
            'var sgx = (col == 2) ? -1 : 1;',
            'var sgy = (row == 2) ? -1 : 1;',
            '[fx + off[0]*sgx, fy + off[1]*sgy]'
        ].join("\n");
    }

    function exPulseScan() {
        return [
            'var C = thisComp.layer("' + N_CTRL + '");',
            'var BC = thisComp.layer("' + N_BARCTRL + '");',
            'var d = Math.max(0.05, C.effect("Flight Time")(1).value);',
            'var pt = 0.3;', // fixed pulse duration - no longer user-exposed
            'var mk = C.marker;',
            'var pulse = 0, pulseSpend = false;',
            'for (var k = 1; k <= mk.numKeys; k++) {',
            '    var tb = mk.key(k).time;',
            '    var amt = parseFloat(mk.key(k).comment);',
            '    if (isNaN(amt) || amt == 0) amt = 100;', // fallback for a hand-typed marker with no number
            '    var sp = amt < 0;',
            '    var n = Math.max(1, Math.round(C.effect("Coins")(1).valueAtTime(tb)));',
            '    var trailD = C.effect("Coin Spacing")(1).value;',
            '    var trailFrac = Math.max(0.05, 1 - (trailD/100)*0.9);',
            '    var stag = d / n * trailFrac;',
            '    for (var i = 0; i < n; i++) {',
            '        var ta = sp ? (tb + i*stag) : (tb + i*stag + d);',
            '        var dt = time - ta;',
            '        if (dt >= 0 && dt <= pt) {',
            '            var v2 = Math.sin(Math.PI * dt / pt);',
            '            if (v2 > pulse) { pulse = v2; pulseSpend = sp; }',
            '        }',
            '    }',
            '}'
        ].join("\n");
    }

    // Bar Scale resizes the bar from the controller; the layer's own Scale
    // stays the baseline, so hand-scaled artwork keeps working. Everything
    // that measures the bar (magnet, glow ring) reads this result, so they
    // follow the new size on their own.
    function exBarScale() {
        return exPulseScan() + "\n" + [
            'var amp = 0.08;', // fixed pulse strength - no longer user-exposed
            'var bs = BC.effect("Bar Scale")(1).value / 100;',
            'value * bs * (1 + amp * pulse)'
        ].join("\n");
    }

    // At rest the ring is white; a hit blends in flat green (gain) or red
    // (spend) by pulse strength - fixed, not a colour the user repoints.
    function exFlashColor() {
        return exPulseScan() + "\n" + [
            'var idle = [1, 1, 1, 1];',
            'var hit = pulseSpend ? [1, 0.22, 0.22, 1] : [0.2, 1, 0.35, 1];',
            'idle + (hit - idle) * pulse'
        ].join("\n");
    }

    function exGlowOpacity() {
        return exPulseScan() + "\n" + [
            'var amp = BC.effect("Glow Int")(1).value;',
            'clamp(pulse * amp, 0, 100)' // zero idle glow, fixed - lights up only on a burst
        ].join("\n");
    }

    // Opacity alone tops out at 100% - past that, cranking Glow Int did
    // nothing visible. This adds a second channel: once pulse*amp pushes
    // past the point where the ring is already fully opaque, the excess
    // drives an exposure overdrive (in stops) instead, so a high Glow Int
    // genuinely punches harder rather than just plateauing.
    function exGlowOverdrive() {
        return exPulseScan() + "\n" + [
            'var amp = BC.effect("Glow Int")(1).value;',
            'clamp((pulse * amp - 100) / 100 * 1.2, 0, 3)'
        ].join("\n");
    }

    // ring OUTER rect: auto-fits the bar's box (comp space, follows scale).
    // NOTE: for a precomp bar the box covers ALL its content (an icon poking
    // out widens it), so Glow Fit trims/expands by hand. Negative = tighter.
    function exGlowOuterSize() {
        return [
            'var B = thisComp.layer("' + N_BAR + '");',
            'var BC = thisComp.layer("' + N_BARCTRL + '");',
            'var r = B.sourceRectAtTime(time, false);',
            'var s = B.transform.scale.value;',
            'var fit = BC.effect("Glow Scale")(1).value;',
            'var w = r.width  * Math.abs(s[0])/100 + fit[0];',
            'var h = r.height * Math.abs(s[1])/100 + fit[1];',
            '[Math.max(0, w), Math.max(0, h)]'
        ].join("\n");
    }

    // ring INNER rect: the outer box pulled in by Glow Width on every side.
    // Subtracted from the outer one (Merge Paths) to punch the hole, so the
    // inner edge gets its own roundness.
    function exGlowInnerSize() {
        return [
            'var B = thisComp.layer("' + N_BAR + '");',
            'var BC = thisComp.layer("' + N_BARCTRL + '");',
            'var r = B.sourceRectAtTime(time, false);',
            'var s = B.transform.scale.value;',
            'var fit = BC.effect("Glow Scale")(1).value;',
            'var gw = BC.effect("Glow Width")(1).value;',
            'var w = r.width  * Math.abs(s[0])/100 + fit[0] - gw*2;',
            'var h = r.height * Math.abs(s[1])/100 + fit[1] - gw*2;',
            '[Math.max(0, w), Math.max(0, h)]'
        ].join("\n");
    }

    function exGlowPosition() {
        return [
            'var B = thisComp.layer("' + N_BAR + '");',
            'var BC = thisComp.layer("' + N_BARCTRL + '");',
            'var r = B.sourceRectAtTime(time, false);',
            'var sh = BC.effect("Glow Offset")(1).value;',
            'var c = B.toComp([r.left + r.width/2, r.top + r.height/2]);',
            '[c[0] + sh[0], c[1] + sh[1]]'
        ].join("\n");
    }

    // Drives AEH_COLLECT_ANCHOR, the shy PARENT of AEH_COLLECT. Same deal as
    // the emitter: the anchor keeps the point glued to the bar's box, while
    // AEH_COLLECT itself stays expression-free so it can be dragged/keyframed.
    function exCollectAnchorPosition() {
        return [
            'var B = thisComp.layer("' + N_BAR + '");',
            'var S = thisComp.layer("' + N_SETUP + '");',
            'var a = clamp(Math.round(S.effect("Collect Anchor")(1).value), 1, 9);',
            'var off = S.effect("Collect Offset")(1).value;',
            'var r = B.sourceRectAtTime(time, false);',
            'var col = (a - 1) % 3, row = Math.floor((a - 1) / 3);',
            'var lx = r.left + r.width  * (col / 2);',
            'var ly = r.top  + r.height * (row / 2);',
            'var c = B.toComp([lx, ly]);',
            '[c[0] + off[0], c[1] + off[1]]'
        ].join("\n");
    }

    // Drives AEH_EMIT_ANCHOR, the shy PARENT of AEH_EMIT. The emitter itself
    // is left expression-free on purpose: the artist drags and keyframes it,
    // while this parent keeps it glued to the comp anchor across resizes.
    function exEmitAnchorPosition() {
        return [
            'var S = thisComp.layer("' + N_SETUP + '");',
            'var a = clamp(Math.round(S.effect("Emitter Anchor")(1).value), 1, 9);',
            'var off = S.effect("Emitter Offset")(1).value;',
            'var col = (a - 1) % 3, row = Math.floor((a - 1) / 3);',
            'var xs = [0, thisComp.width/2, thisComp.width];',
            'var ys = [0, thisComp.height/2, thisComp.height];',
            '[xs[col] + off[0], ys[row] + off[1]]'
        ].join("\n");
    }

    function exCounterText(compRef) {
        compRef = compRef || "thisComp";
        return [
            'var C = ' + compRef + '.layer("' + N_CTRL + '");',
            'var d = Math.max(0.05, C.effect("Flight Time")(1).value);',
            'var v = C.effect("Counter Start")(1).value;',
            'var mk = C.marker;',
            'for (var k = 1; k <= mk.numKeys; k++) {',
            '    var tb = mk.key(k).time;',
            '    var amt = parseFloat(mk.key(k).comment);',
            '    if (isNaN(amt) || amt == 0) amt = 100;', // fallback for a hand-typed marker with no number
            '    var n = Math.max(1, Math.round(C.effect("Coins")(1).valueAtTime(tb)));',
            '    var trailD = C.effect("Coin Spacing")(1).value;',
            '    var trailFrac = Math.max(0.05, 1 - (trailD/100)*0.9);',
            '    var stag = d / n * trailFrac;',
            '    var per = amt / n;',
            '    for (var i = 0; i < n; i++) {',
            '        var ta = (amt < 0) ? (tb + i*stag) : (tb + i*stag + d);',
            '        if (time >= ta) v += per;',
            '    }',
            '}',
            '"" + Math.round(v)'
        ].join("\n");
    }

    // Keeps the digits growing symmetrically around a fixed Position instead
    // of drifting as the digit count changes: point text's anchorPoint sits
    // at the left edge of the typed text by default, so "0" -> "100" -> "1000"
    // visibly shifts. Re-measuring the live text box each frame and pinning
    // the anchor to its centre makes growth happen evenly on both sides.
    function exCounterAnchor() {
        return [
            'var r = thisLayer.sourceRectAtTime(time, false);',
            '[r.left + r.width/2, r.top + r.height/2]'
        ].join("\n");
    }

    // ================= build steps =================

    function createController() {
        var comp = getComp();
        if (!comp) return;
        app.beginUndoGroup(SCRIPT_NAME + ": controller");
        try {
            var ctrl = findLayer(comp, N_CTRL);
            if (!ctrl) {
                ctrl = comp.layers.addNull(comp.duration);
                ctrl.name = N_CTRL;
                ctrl.label = 14;
                ctrl.moveToBeginning();
            }

            var barCtrl = findLayer(comp, N_BARCTRL);
            if (!barCtrl) {
                barCtrl = comp.layers.addNull(comp.duration);
                barCtrl.name = N_BARCTRL;
                barCtrl.label = 9;
                barCtrl.moveAfter(ctrl);
            }

            for (var i = 0; i < CTRL_PARAMS.length; i++) ensureParam(ctrl, CTRL_PARAMS[i]);
            for (var bi = 0; bi < BARCTRL_PARAMS.length; bi++) ensureParam(barCtrl, BARCTRL_PARAMS[bi]);

            // renamed controls: carry the tuned value from the old display
            // name to the new one, then drop the stale copy.
            function migrateRename(layer, oldName, newName) {
                var old = getFx(layer, oldName);
                if (old) {
                    var fresh = getFx(layer, newName);
                    if (fresh) fresh.property(1).setValue(old.property(1).value);
                    removeFx(layer, [oldName]);
                }
            }
            migrateRename(ctrl, "Coin Trail Density", "Coin Spacing");
            migrateRename(barCtrl, "Glow Radius", "Glow Blur");
            migrateRename(barCtrl, "Glow Fit", "Glow Scale");
            migrateRename(barCtrl, "Glow Shift", "Glow Offset");
            migrateRename(barCtrl, "Flash Amount", "Flash Boost");
            migrateRename(barCtrl, "Flash Boost", "Glow Int");
            migrateRename(ctrl, "Grow %", "Start/End Scale");

            // carry an older rig's "Base Value" over to the clearer name
            var oldBase = getFx(ctrl, "Base Value");
            if (oldBase) {
                var cs = getFx(ctrl, "Counter Start");
                if (cs) cs.property(1).setValue(oldBase.property(1).value);
                removeFx(ctrl, ["Base Value"]);
            }

            // a brief in-between version of this script put Counter Start on
            // AEH_BAR_CTRL - move it straight back to AEH_CTRL if found there
            var barSideStart = getFx(barCtrl, "Counter Start");
            if (barSideStart) {
                var ctrlSideStart = getFx(ctrl, "Counter Start");
                if (ctrlSideStart) ctrlSideStart.property(1).setValue(barSideStart.property(1).value);
                removeFx(barCtrl, ["Counter Start"]);
            }

            // Pre-split rigs had bar-feedback controls sitting on AEH_CTRL
            // alongside everything else. Carry each tuned value over to the
            // new AEH_BAR_CTRL, then drop the stale copy - nothing to redo.
            for (var mi = 0; mi < BARCTRL_PARAMS.length; mi++) {
                var pname = BARCTRL_PARAMS[mi].n;
                var stale = getFx(ctrl, pname);
                if (stale) {
                    var fresh = getFx(barCtrl, pname);
                    if (fresh) fresh.property(1).setValue(stale.property(1).value);
                    removeFx(ctrl, [pname]);
                }
            }

            // clear anything from older builds / params that moved to SETUP,
            // or were cut outright (fixed value baked into the expression now)
            removeFx(ctrl, ["Bar Anchor", "Bar Margin", "Bar Margin X", "Bar Margin Y",
                "Bar Offset", "Emitter Anchor", "Emitter Offset", "Collect Anchor",
                "Collect Offset", "Stagger", "Coin Trail",
                "Flash Opacity", "Glow Size", "Glow Intensity",
                "Align Rotation", "Coin Trail Length", "Coin Trail Fade",
                "Coin Impact Flash", "Swarm Cohesion", "Swarm Mid Bulge",
                "Value per Burst"]);
            removeFx(barCtrl, ["Pulse Amount", "Pulse Time",
                "Idle Color", "Gain Color", "Spend Color", "Glow Base", "Glow Color"]);

            var setup = findLayer(comp, N_SETUP);
            if (!setup) {
                setup = comp.layers.addNull(comp.duration);
                setup.name = N_SETUP;
                setup.label = 8;
                setup.guideLayer = true;
                setup.shy = true;
                setup.moveAfter(barCtrl);
            }
            for (var j = 0; j < SETUP_PARAMS.length; j++) ensureParam(setup, SETUP_PARAMS[j]);

            // Coins used to live here; move an older rig's value to AEH_CTRL,
            // where it is visible and can be keyframed.
            var oldCoins = getFx(setup, "Coins");
            if (oldCoins) {
                var cc = getFx(ctrl, "Coins");
                if (cc) cc.property(1).setValue(oldCoins.property(1).value);
                removeFx(setup, ["Coins"]);
            }

            // Bar Anchor/Offset used to live here too; move to AEH_BAR_CTRL,
            // next to Bar Scale, since you need these on day one to place the
            // bar - not the kind of "set once and forget" the rest of SETUP is.
            var oldBarAnchor = getFx(setup, "Bar Anchor");
            if (oldBarAnchor) {
                var freshAnchor = getFx(barCtrl, "Bar Anchor");
                if (freshAnchor) freshAnchor.property(1).setValue(oldBarAnchor.property(1).value);
                removeFx(setup, ["Bar Anchor"]);
            }
            var oldBarOffset = getFx(setup, "Bar Offset");
            if (oldBarOffset) {
                var freshOffset = getFx(barCtrl, "Bar Offset");
                if (freshOffset) freshOffset.property(1).setValue(oldBarOffset.property(1).value);
                removeFx(setup, ["Bar Offset"]);
            }

            // force the Effect Controls order to match the tables above, every
            // time - reordering the array alone only affects newly-created
            // properties, not ones an older rig already built.
            function reorderParams(layer, params) {
                for (var pi = 0; pi < params.length; pi++) {
                    var pfx = getFx(layer, params[pi].n);
                    if (pfx) { try { pfx.moveTo(pi + 1); } catch (eR) {} }
                }
            }
            reorderParams(ctrl, CTRL_PARAMS);
            reorderParams(barCtrl, BARCTRL_PARAMS);
            reorderParams(setup, SETUP_PARAMS);

            // the panel-wide toggle is hideShyLayers, not shyLayers (that name
            // doesn't exist on CompItem - it silently did nothing, leaving every
            // AEH_COIN_* row visible even though each layer's own .shy was true)
            comp.hideShyLayers = true;
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    // blurred glowing RING around the bar: outer rect + inner rect XOR'd via
    // Merge Paths (a true ring, so the inner edge has its own roundness),
    // filled, blurred, ADD, sitting behind the bar. Always rebuilt from
    // scratch so it replaces any older version.
    function buildGlow(comp) {
        var oldF = findLayer(comp, N_FLASH); if (oldF) oldF.remove();
        var oldG = findLayer(comp, N_GLOW);  if (oldG) oldG.remove();

        var glow = comp.layers.addShape();
        glow.name = N_GLOW;
        glow.blendingMode = BlendingMode.ADD;
        glow.shy = true; // it is driven end to end; no reason to sit in the timeline
        var grp = glow.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        grp.name = "GlowRing";
        var gVec = grp.property("ADBE Vectors Group");

        // NOTE: addProperty() invalidates sibling references, so every shape
        // property is configured right after it is added.
        var outer = gVec.addProperty("ADBE Vector Shape - Rect");
        setExpr(outer.property("ADBE Vector Rect Size"), exGlowOuterSize());
        setExpr(outer.property("ADBE Vector Rect Roundness"), barRef("Glow Roundness"));

        var inner = gVec.addProperty("ADBE Vector Shape - Rect");
        setExpr(inner.property("ADBE Vector Rect Size"), exGlowInnerSize());
        setExpr(inner.property("ADBE Vector Rect Roundness"), barRef("Glow Inner Roundness"));

        var merge = gVec.addProperty("ADBE Vector Filter - Merge");
        merge.property("ADBE Vector Merge Type").setValue(5); // Exclude Intersections

        var fill = gVec.addProperty("ADBE Vector Graphic - Fill");
        setExpr(fill.property("ADBE Vector Fill Color"), exFlashColor());

        var gt = glow.property("ADBE Transform Group");
        setExpr(gt.property("ADBE Position"), exGlowPosition());
        setExpr(gt.property("ADBE Opacity"), exGlowOpacity());

        var blur = fxGroup(glow).addProperty("ADBE Box Blur2");
        blur.name = "Glow Blur";
        blur = getFx(glow, "Glow Blur");
        setExpr(blur.property("Blur Radius"), barRef("Glow Blur"));
        try { blur.property("Repeat Edge Pixels").setValue(1); } catch (eB) {}

        var over = tryAddEffect(glow, "ADBE Exposure2", "Glow Overdrive");
        if (over) setExpr(over.property("ADBE Exposure2-0003"), exGlowOverdrive()); // master Exposure (stops)

        var bar = findLayer(comp, N_BAR);
        if (bar) glow.moveAfter(bar); // behind the bar
        return glow;
    }

    function setupBar() {
        var comp = getComp();
        if (!comp) return;
        if (!findLayer(comp, N_CTRL) || !findLayer(comp, N_BARCTRL) || !findLayer(comp, N_SETUP)) {
            alert(SCRIPT_NAME + ": create the controller first (step 1)."); return;
        }

        var bar = findLayer(comp, N_BAR);
        if (!bar) {
            if (comp.selectedLayers.length !== 1) {
                alert(SCRIPT_NAME + ": select exactly one layer to become the bar."); return;
            }
            bar = comp.selectedLayers[0];
            if (bar.name.indexOf("AEH_") === 0) {
                alert(SCRIPT_NAME + ": that is a rig layer, select your bar artwork."); return;
            }
        }

        app.beginUndoGroup(SCRIPT_NAME + ": bar");
        try {
            bar.name = N_BAR;
            if (bar.threeDLayer) bar.threeDLayer = false;
            var tr = bar.property("ADBE Transform Group");
            setExpr(tr.property("ADBE Position"), exBarPosition());
            setExpr(tr.property("ADBE Scale"), exBarScale());

            // Collect = free null riding a shy bar-driven parent, so it can be
            // dragged and keyframed while still following the bar.
            var cAnc = findLayer(comp, N_COLLANC);
            if (!cAnc) {
                cAnc = comp.layers.addNull(comp.duration);
                cAnc.name = N_COLLANC; cAnc.label = 8;
                cAnc.guideLayer = true; cAnc.shy = true;
            }
            setExpr(cAnc.property("ADBE Transform Group").property("ADBE Position"), exCollectAnchorPosition());

            var col = findLayer(comp, N_COLLECT);
            if (!col) {
                col = comp.layers.addNull(comp.duration);
                col.name = N_COLLECT; col.label = 11;
            }
            col.guideLayer = true;
            col.shy = false;
            var cp = col.property("ADBE Transform Group").property("ADBE Position");
            cp.expression = "";            // hand-placeable + keyframable
            col.parent = cAnc;
            if (cp.numKeys === 0) cp.setValue([0, 0]); // sit on the anchor; keep any animation
            col.moveBefore(cAnc);

            // Emitter = free null riding a shy anchor-driven parent, so it can
            // be dragged and keyframed while still surviving comp resizes.
            var eAnc = findLayer(comp, N_EMITANC);
            if (!eAnc) {
                eAnc = comp.layers.addNull(comp.duration);
                eAnc.name = N_EMITANC; eAnc.label = 8;
                eAnc.guideLayer = true; eAnc.shy = true;
            }
            setExpr(eAnc.property("ADBE Transform Group").property("ADBE Position"), exEmitAnchorPosition());

            var emit = findLayer(comp, N_EMIT);
            if (!emit) {
                emit = comp.layers.addNull(comp.duration);
                emit.name = N_EMIT; emit.label = 11;
            }
            var ep = emit.property("ADBE Transform Group").property("ADBE Position");
            ep.expression = "";           // hand-placeable + keyframable
            emit.parent = eAnc;
            if (ep.numKeys === 0) ep.setValue([0, 0]); // sit on the anchor; keep any animation
            emit.moveBefore(eAnc);

            buildGlow(comp);

            // Rebuilding the rig changes how coins must read the endpoints
            // (e.g. parenting made positions parent-relative), so refresh any
            // existing flock right here instead of relying on a manual step 3.
            var tpl = findLayer(comp, N_COINSRC);
            if (tpl) coinsFrom(comp, tpl);
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    // rig must exist before coins can reference it
    function coinsReady(comp) {
        if (!findLayer(comp, N_CTRL) || !findLayer(comp, N_SETUP)) {
            alert(SCRIPT_NAME + ": create the controller first (step 1)."); return false;
        }
        if (!findLayer(comp, N_EMIT) || !findLayer(comp, N_COLLECT)) {
            alert(SCRIPT_NAME + ": set up the bar first (step 2)."); return false;
        }
        return true;
    }

    // core: turn `src` into the hidden coin template and (re)spawn the flock
    // Coins is animatable, but coin layers are physical duplicates that cannot
    // appear mid-render. So build a pool big enough for the busiest burst:
    // sample Coins at every marker and take the max - and never less than
    // POOL_FLOOR, so raising the Coins slider later (up to that floor) just
    // works without a rebuild. Below POOL_FLOOR was the #1 point of
    // confusion: "I raised Coins and nothing changed" - it hadn't, because
    // the physical layers to show more simply didn't exist yet.
    var POOL_FLOOR = 60;

    function coinPoolSize(ctrl) {
        var fx = getFx(ctrl, "Coins");
        if (!fx) throw new Error("AEH_CTRL has no 'Coins' control - re-run step 1.");
        var p = fx.property(1);
        var maxN = Math.round(p.value);
        var mk = ctrl.property("ADBE Marker");
        for (var k = 1; k <= mk.numKeys; k++) {
            var v = Math.round(p.valueAtTime(mk.keyTime(k), false));
            if (v > maxN) maxN = v;
        }
        maxN = Math.max(maxN, POOL_FLOOR);
        return Math.max(1, Math.min(200, maxN));
    }

    function coinsFrom(comp, src) {
        var ctrl = findLayer(comp, N_CTRL);
        src.name = N_COINSRC;
        src.enabled = false;
        src.shy = true;

        for (var i = comp.numLayers; i >= 1; i--) {
            var nm = comp.layer(i).name;
            if (nm.indexOf(N_COIN) === 0 && nm !== N_COINSRC) comp.layer(i).remove();
        }

        var n = coinPoolSize(ctrl);
        for (var c = 0; c < n; c++) {
            var dcoin = src.duplicate();
            dcoin.name = N_COIN + (c + 1);
            dcoin.enabled = true;
            dcoin.shy = true; // fully expression-driven; keeps the timeline short
            var sl = getFx(dcoin, "Coin Index");
            if (!sl) {
                sl = fxGroup(dcoin).addProperty("ADBE Slider Control");
                sl.name = "Coin Index";
                sl = getFx(dcoin, "Coin Index");
            }
            sl.property(1).setValue(c);
            var tr = dcoin.property("ADBE Transform Group");
            setExpr(tr.property("ADBE Position"), exCoinPosition());
            setExpr(tr.property("ADBE Scale"), exCoinScale());
            setExpr(tr.property("ADBE Opacity"), exCoinOpacity());

            var gl = getFx(dcoin, "Coin Glow FX") || tryAddEffect(dcoin, "ADBE Glo2", "Coin Glow FX");
            if (gl) {
                setExpr(gl.property("ADBE Glo2-0004"), exCoinGlow()); // Glow Intensity
                setExpr(gl.property("ADBE Glo2-0003"), exCoinGlowRadius()); // Glow Radius
                // AE's own Threshold default (~60%) means anything short of
                // near-white never triggers glow at all - fixed low, not
                // exposed, so Coin Glow/Radius actually do something visible.
                try { gl.property("ADBE Glo2-0002").setValue(10); } catch (eT) {} // Glow Threshold
                // "Original Colors" samples the art itself - on this coin
                // that's as likely to be its black outline as its fill. A & B
                // Colors with A=B locks the glow to one fixed, user-set tint.
                try { gl.property("ADBE Glo2-0007").setValue(2); } catch (eC) {} // Glow Colors: A & B Colors
                try { gl.property("ADBE Glo2-0008").setValue(false); } catch (eL) {} // Color Looping off
                setExpr(gl.property("ADBE Glo2-0012"), exCoinGlowColor()); // Color A
                setExpr(gl.property("ADBE Glo2-0013"), exCoinGlowColor()); // Color B
            }

            dcoin.moveAfter(ctrl);
        }
    }

    function buildCoins() {
        var comp = getComp();
        if (!comp) return;
        if (!coinsReady(comp)) return;

        var src = null;
        if (comp.selectedLayers.length === 1 &&
            comp.selectedLayers[0].name.indexOf("AEH_") !== 0) {
            src = comp.selectedLayers[0];
        } else {
            src = findLayer(comp, N_COINSRC);
        }
        if (!src) { alert(SCRIPT_NAME + ": select the coin artwork layer."); return; }

        app.beginUndoGroup(SCRIPT_NAME + ": coins");
        try {
            coinsFrom(comp, src);
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    // ================= delivery sizes =================

    function findCompByName(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === name) return it;
        }
        return null;
    }

    function ensureFolder(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof FolderItem && it.name === name) return it;
        }
        return app.project.items.addFolder(name);
    }

    // Stamp the delivery formats off the current comp: a straight duplicate,
    // renamed and resized. Doesn't require a rig to already be built - works
    // on any comp, so sizes can be stamped first and the rig built into each
    // one after, if that's the order you prefer. When a rig IS already
    // present, every expression in it reads "thisComp", so each copy is a
    // fully independent rig from the moment it exists - its own AEH_CTRL,
    // own markers, own everything. Nothing here ever points back at the comp
    // it was made from.
    //
    // That is deliberate: earlier this stripped each copy's AEH_CTRL and had
    // it read the source comp's by hardcoded name (comp("Name")) instead, to
    // keep one shared set of markers. It broke the moment that comp got
    // renamed or deleted - which is the normal way to finish this workflow
    // (build a master, stamp sizes, throw the master away). Independent
    // copies cost you re-editing each size by hand if you tweak timing after
    // stamping, but they cannot break this way.
    function makeSizes() {
        var master = getComp();
        if (!master) return;

        var made = [], reused = [];

        app.beginUndoGroup(SCRIPT_NAME + ": delivery sizes");
        try {
            var folder = ensureFolder(master.name + " sizes");
            for (var i = 0; i < SIZES.length; i++) {
                var w = SIZES[i][0], h = SIZES[i][1];
                var nm = master.name + "_" + w + "x" + h;
                var c = findCompByName(nm);
                if (c) {
                    reused.push(nm); // already made - leave it alone
                    continue;
                }
                c = master.duplicate();
                c.name = nm;
                c.width = w;
                c.height = h;
                c.parentFolder = folder;
                made.push(nm);
            }
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
            app.endUndoGroup();
            return;
        }
        app.endUndoGroup();

        var msg = SCRIPT_NAME + ": delivery sizes ready in folder \"" + master.name + " sizes\".\n\n";
        if (made.length) msg += "Created: " + made.join(", ") + "\n";
        if (reused.length) msg += "Already existed, left untouched: " + reused.join(", ") + "\n";
        msg += "\nEach size is a fully independent copy - if there's a rig on this comp,\n" +
               "that includes its own markers, sliders, colours, everything. Safe to\n" +
               "rename or delete this comp afterward.\n\n" +
               "Editing this comp now will NOT reach sizes already made. To pick up\n" +
               "changes, either edit before stamping, or delete a size comp and\n" +
               "re-run to get a fresh copy.";
        alert(msg);
    }

    function findController(fromComp) {
        if (findLayer(fromComp, N_CTRL)) return { compRef: "thisComp", comp: fromComp };
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.id !== fromComp.id && findLayer(it, N_CTRL)) {
                return { compRef: 'comp("' + it.name.replace(/"/g, '\\"') + '")', comp: it };
            }
        }
        return null;
    }

    function linkCounter() {
        var comp = getComp();
        if (!comp) return;
        if (comp.selectedLayers.length !== 1 || !(comp.selectedLayers[0] instanceof TextLayer)) {
            alert(SCRIPT_NAME + ": select exactly one existing text layer (your counter) first."); return;
        }
        var t = comp.selectedLayers[0];
        var found = findController(comp);
        if (!found) { alert(SCRIPT_NAME + ": couldn't find AEH_CTRL - run step 1 first."); return; }

        app.beginUndoGroup(SCRIPT_NAME + ": link counter");
        var apShifted = false;
        try {
            var td = t.property("ADBE Text Properties").property("ADBE Text Document");
            var cur = parseFloat(String(td.value.text).replace(/[^0-9.\-]/g, ""));
            var bv = getFx(findLayer(found.comp, N_CTRL), "Counter Start");
            if (!isNaN(cur) && bv) bv.property(1).setValue(cur);
            setExpr(td, exCounterText(found.compRef));

            // re-centering the anchor point moves where Position visually
            // lands (on-screen spot = Position - AnchorPoint), so nudge
            // Position by the same delta to keep this counter exactly where
            // it already was, then hand the anchor to the live-centering
            // expression so future digit-count changes grow symmetrically.
            var atr = t.property("ADBE Transform Group");
            var apProp = atr.property("ADBE Anchor Point");
            var posProp = atr.property("ADBE Position");
            var oldAP = apProp.value;
            var r = t.sourceRectAtTime(comp.time, false);
            var newAP = [r.left + r.width / 2, r.top + r.height / 2];
            if (posProp.numKeys === 0) {
                var curPos = posProp.value;
                posProp.setValue([curPos[0] + (newAP[0] - oldAP[0]), curPos[1] + (newAP[1] - oldAP[1])]);
                apShifted = true;
            }
            setExpr(apProp, exCounterAnchor());
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
            app.endUndoGroup();
            return;
        }
        app.endUndoGroup();

        if (!apShifted) {
            alert(SCRIPT_NAME + ": this counter's Position has its own keyframes,\n" +
                "so its anchor point could not be auto-compensated. The number\n" +
                "will now grow symmetrically from its centre going forward, but\n" +
                "check its placement - it may have shifted slightly.");
        }

        // AEH_CTRL wasn't in this comp, so the link had to hardcode the other
        // comp's NAME - the one thing that breaks it forever is renaming or
        // deleting that comp. Say so now, while it's actionable.
        if (found.compRef !== "thisComp") {
            alert(SCRIPT_NAME + ": linked to AEH_CTRL in \"" + found.comp.name + "\".\n\n" +
                "This only works as long as that comp keeps this exact name.\n" +
                "Renaming or deleting \"" + found.comp.name + "\" will break this counter -\n" +
                "if that happens, just select the text layer and run this again.");
        }
    }

    function addBurstMarker(isSpend) {
        var comp = getComp();
        if (!comp) return;
        var ctrl = findLayer(comp, N_CTRL);
        if (!ctrl) { alert(SCRIPT_NAME + ": create the controller first (step 1)."); return; }

        var s = prompt("Amount for this burst:", "100");
        if (s === null) return;
        var amt = parseFloat(s);
        if (isNaN(amt) || amt === 0) { alert(SCRIPT_NAME + ": enter a non-zero number."); return; }
        amt = isSpend ? -Math.abs(amt) : Math.abs(amt);

        app.beginUndoGroup(SCRIPT_NAME + ": marker");
        try {
            ctrl.property("ADBE Marker").setValueAtTime(comp.time, new MarkerValue(String(amt)));
        } catch (e) {
            alert(SCRIPT_NAME + " error: " + e.toString());
        }
        app.endUndoGroup();
    }

    // ================= UI =================

    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 6;
        pal.margins = 12;

        var gBuild = pal.add("panel", undefined, "Build");
        gBuild.orientation = "column";
        gBuild.alignChildren = ["fill", "top"];
        gBuild.margins = 10;

        var b1 = gBuild.add("button", undefined, "1. Create / update controller");
        var b2 = gBuild.add("button", undefined, "2. Selected layer -> BAR (magnet + glow)");
        var b3 = gBuild.add("button", undefined, "3. Selected layer -> coins (build / rebuild)");
        var b4 = gBuild.add("button", undefined, "4. Link SELECTED text -> counter");

        var gMark = pal.add("panel", undefined, "Bursts (markers on AEH_CTRL)");
        gMark.orientation = "row";
        gMark.alignChildren = ["fill", "top"];
        gMark.margins = 10;

        var bGain = gMark.add("button", undefined, "+ GAIN");
        var bSpend = gMark.add("button", undefined, "- SPEND");
        bGain.preferredSize.width = 90;
        bSpend.preferredSize.width = 90;

        var gExtra = pal.add("panel", undefined, "Extras");
        gExtra.orientation = "row";
        gExtra.alignChildren = ["fill", "top"];
        gExtra.margins = 10;
        var bSizes = gExtra.add("button", undefined, "Go Resize");
        var sizeList = [];
        for (var si = 0; si < SIZES.length; si++) sizeList.push(SIZES[si][0] + "x" + SIZES[si][1]);
        bSizes.helpTip = "Duplicates this comp into " + sizeList.join(", ") +
            " - each a fully independent rig. Safe to delete this comp afterward.";

        b1.onClick = createController;
        b2.onClick = setupBar;
        b3.onClick = buildCoins;
        b4.onClick = linkCounter;
        bGain.onClick = function () { addBurstMarker(false); };
        bSpend.onClick = function () { addBurstMarker(true); };
        bSizes.onClick = makeSizes;

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };

        if (pal instanceof Window) { pal.center(); pal.show(); }
        return pal;
    }

    buildUI(thisObj);

})(this);
