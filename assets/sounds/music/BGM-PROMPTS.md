# Prompt สร้างเพลงประกอบ (BGM)

เขียนสำหรับ Suno (v4 ขึ้นไป) หรือเครื่องมือสร้างเพลงที่รับ "style prompt" แบบเดียวกัน (Udio, ElevenLabs Music)
ผลที่ได้วางในโฟลเดอร์นี้ ตั้งชื่อตามคอลัมน์ "ไฟล์" (`.mp3` 128–192 kbps) หลายเพลงต่อช่วง = `<ชื่อ>-1.mp3`, `<ชื่อ>-2.mp3` …

## ตั้งค่าทุกเพลง

- เปิด **Instrumental** (ห้ามมีเนื้อร้อง: เพลงเล่นใต้เสียงเอฟเฟกต์และตัวหนังสือเยอะ)
- ใส่ **Exclude styles**: `vocals, lyrics, choir singing words, lo-fi, heavy distortion, long silence, fade out`
- ห้ามใส่ชื่อเกม / ศิลปิน / เพลงที่มีอยู่จริงใน prompt (ลิขสิทธิ์)

## ตั้งค่าในหน้า Suno (โหมด Advanced)

| ช่อง | ค่า |
|---|---|
| Lyrics | ปล่อยว่าง (ถ้ามีสวิตช์ Instrumental ในหัวข้อนี้ ให้เปิด) |
| Styles | วาง style prompt ของเพลงนั้น |
| Vocal Gender | ไม่เลือก |
| Duration | Custom: เพลงวน 2:30–3:00 · เพลงจบเกม ตั้งสั้นสุดแล้วตัดเหลือ 8–15 วิ |
| Weirdness | 30–35% (อยากได้เพลงเกมแบบมาตรฐาน ไม่แปลก) |
| Style Influence | 70–75% (ให้ตาม prompt มากขึ้น) |
| Variety | Normal |
| Personalize | Off (ไม่ให้ผสมรสนิยมเพลงส่วนตัว) |

หน้านี้ไม่มีช่อง Exclude styles: เขียน `instrumental, no vocals` ไว้ใน Styles แล้ว ถ้ายังมีเสียงร้องปน ให้สร้างใหม่

## ทำให้วนซ้ำได้ (เพลงในเกมทุกเพลง ยกเว้นเพลงจบเกม)

- เลือกเวอร์ชันที่ **ไม่มีอินโทรช้า / ไม่มีตอนจบที่จางหาย** (ต่อท้ายกับต้นเพลงได้)
- ตัดให้ยาว 1:30–2:30 ตัดตรงจังหวะห้อง (bar) แล้วลองฟังต่อวน 2 รอบ ถ้ามีรอยสะดุดให้ตัดช่วงอื่น
- ความดัง: เพลงต้องเบากว่า SFX ได้ (เกมตั้ง BGM ไว้ 45%) เลี่ยงเพลงที่อัดดังตลอด (mastering หนักเกิน)

## มีอยู่แล้ว: เพิ่มเพลงสำรองได้ (สุ่มเล่นทีละเกม)

ใส่ได้เลยไม่ต้องแก้โค้ด ตั้งชื่อ `duel-2.mp3`, `ace-2.mp3` …

| ไฟล์ | เล่นเมื่อ | BPM | Style prompt |
|---|---|---|---|
| `duel` | ระหว่างดวลปกติ | 120–130 | `Instrumental fantasy card battle music, tense but focused, driving orchestral strings with electronic pulse, light rock drums, taiko accents, heroic brass motifs, energetic yet leaves room for sound effects, loopable, no intro, no fade out` |
| `ace` | มีการ์ด X-Rare บนสนาม | 140–150 | `Instrumental epic boss battle anthem, powerful full orchestra with choir pads (no words), fast electric guitar riffs, thunderous drums, triumphant brass melody, legendary champion has entered the battlefield, loopable, no intro, no fade out` |
| `pinch` | Life ฝ่ายใดเหลือ ≤ 2 | 155–170 | `Instrumental climactic final showdown music, urgent ticking rhythm, racing strings ostinato, heavy pounding drums, rising tension, dramatic minor key brass stabs, last turn decides everything, loopable, no intro, no fade out` |

## เพลงใหม่ที่เสนอ (ต้องแก้โค้ดก่อนถึงจะได้ยิน: ตอนนี้นอกเกมเงียบหมด)

เรียงจากสำคัญมากไปน้อย

| # | ไฟล์ | เล่นเมื่อ | ยาว | BPM | Style prompt |
|---|---|---|---|---|---|
| 1 | `title` | ทุกหน้านอกเกม: หน้าไตเติล / หน้าหลัก / หน้า DUEL (ห้องดวล) / จัดเด็ค / ดูเด็ค / เด็คของฉัน (เพลงเดียวกัน เล่นต่อเนื่องตอนเปลี่ยนหน้า ไม่เริ่มใหม่) | วน 2:00–3:00 | 110–124 | ดูหัวข้อ "เพลงเมนู (`title`)" ด้านล่าง |
| 2 | `victory` | หน้าผลการแข่ง: ชนะ | 8–15 วิ (ไม่วน) | 120 | `Short instrumental victory fanfare, triumphant brass and orchestral hits, bright cymbal swell, heroic celebratory resolution, ends on a strong final chord` |
| 3 | `defeat` | หน้าผลการแข่ง: แพ้ | 8–15 วิ (ไม่วน) | 70 | `Short instrumental defeat theme, melancholic solo piano and soft strings, gentle descending melody, bittersweet but hopeful, ends on a quiet resolved chord` |
| 4 | `tutorial` | บทเรียน | วน 1:30–2:30 | 95–105 | `Instrumental friendly tutorial music, light and encouraging, pizzicato strings, glockenspiel, soft woodwinds, playful light percussion, learning something new with a smile, loopable, no intro, no fade out` |

### เพลงเมนู (`title`)

แนวที่ต้องการ: เพลงหน้าเมนูของเกมการ์ดดิจิทัลยุคใหม่ ทันสมัย เท่ ดูแพง เหมือนยืนอยู่ในห้องโถงของสนามดวลระดับโลกก่อนเริ่มแข่ง
ผสมออร์เคสตรากับอิเล็กทรอนิกส์ (ไม่ใช่แฟนตาซีย้อนยุค) จังหวะกลาง ๆ มีพลังแต่ไม่เร่งเร้า ฟังได้นานตอนจัดเด็คโดยไม่รบกวนการอ่านการ์ด

**Style prompt (ใส่ในช่อง Style ของ Suno):**

```
Instrumental modern digital card game main menu theme, sleek hybrid orchestral electronic, cinematic strings ostinato over a clean four-on-the-floor synth pulse, glossy synth arpeggios, deep sub bass, crisp electronic drums, bold heroic brass melody, sparkling piano motif, futuristic holographic duel arena lobby, confident and stylish, anticipation before a championship match, polished AAA game soundtrack, steady energy that does not distract, loopable, no intro, no fade out, no vocals
```

**Exclude styles:** `vocals, lyrics, medieval, folk, lo-fi, chiptune, dubstep drop, heavy metal, long silence, fade out`

**เคล็ดลับ:**
- ห้ามใส่ชื่อเกมที่อ้างอิงลงใน prompt (Suno ปฏิเสธชื่อเกม/ศิลปิน และเพลงต้องเป็นของเราเอง ไม่ลอกเพลงของเกมนั้น) prompt ด้านบนบรรยายแนวไว้แทนแล้ว
- ถ้าออกมาเป็นเพลงต่อสู้เกินไป: เปลี่ยน `bold heroic brass melody` เป็น `restrained brass swells` และลด BPM เหลือ ~110
- ถ้าจืดหรือเหมือนเพลงประกอบโฆษณา: เพิ่ม `memorable main theme melody, epic choir pads` (choir ไม่มีคำร้อง)
- สร้างหลายแบบแล้วเลือกแบบที่ทำนองจำง่ายที่สุด ใช้ทำนองนั้นซ้ำใน `victory` ได้ (ใช้ฟีเจอร์ cover/extend ของเพลง title แล้วใส่ prompt ของ `victory` ต่อท้ายด้วย `reprise of the main menu melody`)

### ทิปของเพลงใหม่

- `title` ได้ยินนานที่สุด (เปิดแอปและอยู่หน้าจัดเด็คนาน ๆ) จึงต้องวนได้เนียนที่สุด และไม่ดังกว่าเสียงคลิกเมนู
- `victory` / `defeat` ห้ามยาวเกิน 15 วิ: หน้าผลการแข่งเปิดค้างได้ เพลงจบแล้วเงียบ (ไม่วน)
