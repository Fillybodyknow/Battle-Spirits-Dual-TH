# Prompt สร้างไฟล์ SFX (ElevenLabs Sound Effects)

วางไฟล์ที่ได้ในโฟลเดอร์นี้ ตั้งชื่อตามคอลัมน์ "ไฟล์" (`.mp3` / `.wav` / `.ogg`) เกมจะเล่นไฟล์แทนเสียงสังเคราะห์ทันที
ใส่ทีละเสียงได้ เสียงที่ยังไม่มีไฟล์ใช้เสียงสังเคราะห์เหมือนเดิม

## ต่อท้ายทุก prompt

```
Fantasy trading card game sound effect, polished mobile game quality, punchy and clean, no music, no voice, no leading silence, short tail.
```

## ข้อควรระวัง

- **ต้นไฟล์ห้ามมีช่วงเงียบ**: เสียงตั้งเวลาให้ตรงแอนิเมชัน ถ้าเงียบตอนต้นเสียงจะช้ากว่าภาพ
- **ตั้ง Duration เอง** ตามคอลัมน์ "ยาว" (ไม่ใช้ Auto) ถ้าตั้งต่ำกว่าขั้นต่ำของ ElevenLabs ไม่ได้ ให้สร้างแล้วตัดหางเงียบทิ้ง
- **ไม่ต้องมีเสียงก้องยาว**: หลายเสียงเล่นซ้อนกัน ก้องยาวจะฟังขุ่น
- สร้าง 3–4 แบบต่อ prompt แล้วเลือกแบบที่เข้ากับเสียงอื่นที่สุด
- Prompt Influence: ยาวเกิน/มีดนตรีปน → เพิ่ม 10–20% · จืด/เหมือนกันทุกรอบ → ลดลง

## ยังไม่มีไฟล์ (ทำชุดนี้ก่อน · ตรวจเมื่อ 2026-11-21)

มีไฟล์แล้ว 25 ชื่อ ส่วนชื่อด้านล่างยังใช้เสียงสังเคราะห์อยู่ (เรียงตามความถี่ที่ได้ยินในเกม)

| # | ไฟล์ | ยาว | Influence | Prompt | เล่นเมื่อ |
|---|---|---|---|---|---|
| 1 | `hover` | 0.04s | 80% | Extremely subtle soft UI tick, barely audible, airy and high | ชี้การ์ด/ปุ่มเมนู (ได้ยินบ่อยมาก ต้องเบาที่สุด) |
| 2 | `swish` | 0.2s | 55% | Quick sword-like swish, declaring an attack, sharp and energetic | ประกาศโจมตี / ป้องกัน |
| 3 | `error` | 0.3s | 75% | Soft negative UI buzz, two short low tones, not harsh | ทำ action ไม่ได้ |
| 4 | `buff` | 0.3s | 40% | Power up, quick three-note ascending sparkle | BP+ / ได้ไลฟ์ |
| 5 | `burst` | 1.0s | 35% | Hidden trap card bursts open, sudden dark explosive whoomp with a dramatic brass-like stab | ป้ายใหญ่ CATALYZE ฯลฯ / Final Blow |
| 6 | `duelStart` | 0.9s | 40% | Massive magical gate unlocking and opening, deep mechanical rumble rising into a bright energy shimmer, anticipation building, no final hit | ฉากเปิดเกม ป้าย "GATE OPEN" (ประตูเปิด · เสียงต้องค้างความตื่นเต้นไว้ให้ KAIHO!! ทุบต่อ) |
| 6.1 | `kaiho` | 1.2s | 45% | Colossal cinematic impact slam, huge low boom with explosive crack at the very start, shockwave whoosh and deep rumble tail, battle has begun | ฉากเปิดเกม ป้าย "KAIHO!!" กระแทกลง (จุดกระแทกต้องอยู่ต้นไฟล์ · ไม่มีไฟล์ = ใช้ bigdamage) |
| 7 | `win` | 1.5s | 35% | Short victory fanfare sting, triumphant bright brass and chime | ป้ายชนะ / หน้าผลการแข่ง |
| 8 | `resolve` | 0.5s | 40% | Effect resolves, quick magical swoosh rising up and releasing | ป้าย RESOLVE |
| 9 | `chain` | 0.25s | 60% | Short metallic chain clink | ป้าย CHAIN |
| 10 | `tick` | 0.12s | 75% | Tiny soft notification tick | ป้ายเล็ก |

### ยืมไฟล์อื่นอยู่ (ไม่ใช่เสียงสังเคราะห์ · ทำเพิ่มได้ถ้าอยากให้แต่ละแบบฟังต่างกัน)

ไม่มีไฟล์ของตัวเอง = เล่นไฟล์ของเสียงอื่นแทน (`ALIAS` ใน `apps/web/src/sfx.ts`)

| ไฟล์ | ตอนนี้ใช้ | ยาว | Influence | Prompt | เล่นเมื่อ |
|---|---|---|---|---|---|
| `magic` | `activate` | 0.8s | 35% | Casting a spell card, magical energy swelling up then a bright arcane chord | ใช้เมจิก [Main] |
| `flash` | `activate` | 0.5s | 35% | Instant counter-spell, sharp electric zap with a fast bright shimmer, urgent | ใช้ [Flash] |
| `burstCard` | `activate` | 0.8s | 40% | Face-down trap card flipping open, sharp paper snap followed by a dark magical surge | การ์ด Burst ทำงาน |

**แนะนำ:** `hover` / `tick` / `click` ได้ยินบ่อยที่สุด ให้ทั้งสามฟังเป็นชุดเดียวกัน (เสียงแก้วใสคล้ายกัน คนละความดัง)

### เสียงใหม่ที่เสนอ (ต้องแก้โค้ดก่อนถึงจะได้ยิน)

| ไฟล์ | ยาว | Influence | Prompt | เล่นเมื่อ |
|---|---|---|---|---|
| `lose` | 1.5s | 35% | Short defeat sting, low descending brass and soft fading choir, somber but not depressing | หน้าผลการแข่งตอนแพ้ (ตอนนี้ใช้ `fade`) |
| `block` | 0.35s | 55% | Fantasy shield raised to block, solid metal clang with a short magical barrier hum | ประกาศป้องกัน (ตอนนี้ใช้ `swish` เหมือนประกาศโจมตี) |

## รายการ (เรียงจากสำคัญมากไปน้อย)

| # | ไฟล์ | ยาว | Influence | Prompt | เล่นเมื่อ |
|---|---|---|---|---|---|
| 1 | `click` | 0.08s | 75% | Crisp soft UI button click, subtle glassy tick, very short | กดปุ่ม |
| 2 | `impact` | 0.4s | 55% | Heavy fantasy creature hit impact, deep thud with a sharp crack on top, body blow | ชนเป้าหมาย |
| 3 | `whoosh` | 0.35s | 55% | Fast air whoosh of a creature charging forward, rising swoosh | ผู้โจมตีวิ่ง |
| 4 | `swish` | 0.2s | 55% | Quick sword-like swish, declaring an attack, sharp and energetic | ประกาศโจมตี |
| 5 | `place` | 0.3s | 55% | Card slammed onto a stone table, solid low thump with slight magical shimmer | การ์ดลงสนาม |
| 6 | `draw` | 0.2s | 75% | Single playing card sliding off a deck, crisp paper slide | จั่วการ์ด |
| 7 | `shatter` | 0.5s | 50% | Magical crystal creature shattering into glass shards, bright breaking burst | ถูกทำลาย |
| 8 | `damage` | 0.35s | 55% | Player takes damage, muffled punchy hit with a short downward distorted tone | เสียไลฟ์ |
| 9 | `bigdamage` | 0.8s | 50% | Massive direct hit to the player, deep boom with rumble and distortion, screen shake feeling | โดนโจมตีตรง |
| 10 | `core` | 0.15s | 75% | Small glowing gem placed down, tiny crystalline clink with a bright sparkle | ย้าย Core |
| 11 | `activate` | 0.5s | 40% | Card ability activates, quick ascending magical chime with soft sparkle | เอฟเฟกต์ทำงาน |
| 12 | `magic` | 0.8s | 35% | Casting a spell card, magical energy swelling up then a bright arcane chord | ใช้เมจิก [Main] |
| 13 | `flash` | 0.5s | 35% | Instant counter-spell, sharp electric zap with a fast bright shimmer, urgent | ใช้ [Flash] |
| 14 | `burst` | 1.0s | 35% | Hidden trap card bursts open, sudden dark explosive whoomp with a dramatic brass-like stab | Burst ทำงาน |
| 15 | `xrare` | 1.2s | 35% | Legendary card summon charge-up, energy rising rapidly into a powerful deep cinematic hit | Cut-in X-Rare (*) |
| 16 | `turn` | 1.2s | 35% | New turn begins, deep resonant gong-like tone with a soft airy shimmer | เทิร์นใหม่ |
| 17 | `step` | 0.4s | 40% | Battle phase start, short heroic rising swoosh with a metallic ring | ATTACK STEP |
| 18 | `chainLock` | 0.9s | 55% | Heavy iron chain locking into place, metal clank with deep low thud and ringing metal | Chain 2 ล็อก |
| 19 | `chainIn` | 0.5s | 40% | Magic card flying into a stack, rising wind rush with sparkle | การ์ดพุ่งเข้ากอง Chain |
| 20 | `chainRattle` | 0.4s | 55% | Metal chain links rattling quickly as a chain is pulled taut | โซ่ลากมาต่อ |
| 21 | `chainLockHeavy` | 1.2s | 50% | Massive iron chain slamming shut, very heavy metal impact with double thud and low resonance | Chain 3+ ล็อก |
| 22 | `chainNumber` | 0.35s | 70% | Bright metallic number flip, short high chime | เลข Chain พลิก |
| 23 | `chainDrone` | 1.3s | 35% | Low ominous magical hum, steady and dark, fading out at the end | ช่วงค้างของฉาก Chain |
| 24 | `fade` | 0.7s | 40% | Spirit dissolving into dust, soft descending airy fade | สูญสลาย |
| 25 | `buff` | 0.3s | 40% | Power up, quick three-note ascending sparkle | BP+ / ได้ไลฟ์ |
| 26 | `error` | 0.3s | 75% | Soft negative UI buzz, two short low tones, not harsh | ทำ action ไม่ได้ |
| 27 | `win` | 1.5s | 35% | Short victory fanfare sting, triumphant bright brass and chime | ชนะ |
| 28 | `hover` | 0.04s | 80% | Extremely subtle soft UI tick, barely audible | ชี้การ์ด |
| 29 | `resolve` | 0.5s | 40% | Effect resolves, quick magical swoosh rising up and releasing | RESOLVE |
| 30 | `chain` | 0.25s | 60% | Short metallic chain clink | ป้าย CHAIN |
| 31 | `tick` | 0.12s | 75% | Tiny soft notification tick | ป้ายเล็ก |

(*) `xrare`: ตอน Cut-in เกมเล่น `whoosh` → `xrare` → `impact` → `bigdamage` ซ้อนกันตรงจังหวะทุบอยู่แล้ว
ดังนั้น `xrare` ควรเป็นช่วงชาร์จที่จบด้วยการกระแทกสั้น ๆ ไม่ใช่เสียงระเบิดยาว
