/**
 * Show Me Türkiye — AI Trip Planner Worker v4
 *
 * Cost optimizations vs v3:
 * - Prompt caching: 90% reduction on cached reads ($0.10/M vs $1/M for Haiku)
 * - Default model: Haiku 4.5 ($1/M in, $5/M out) — 3x cheaper than Sonnet 4.5
 * - Sonnet 4.5 only for itinerary generation (complex multi-day plans)
 * - System prompt split: small persona block (uncached) + large knowledge block (cached)
 * - max_tokens: 800 default, 3000 for itineraries (down from flat 4000)
 *
 * Expected cost: $0.0003-0.015 per conversation (down from $0.04-0.20)
 *
 * Required secret: ANTHROPIC_API_KEY
 */

const PLACES_BY_CITY = {
  "Adana": ["Tasköprü Roman Stone Bridge", "Sabancı Merkez Camii", "Ulu Cami and Old Bazaar", "Adana Arkeoloji Müzesi", "Seyhan Dam", "Anavarza Ancient City", "Yumurtalık Kalesi", "Tarsus"],
  "Afyonkarahisar": ["Afyonkarahisar Kalesi", "Afyonkarahisar Ulu Camii", "Gedik Ahmet Pasha Complex", "Victory Museum and Historic Quarter", "Ömer Ilıcası", "Kocatepe Monument", "İhsaniye Frigya Vadisi", "Apameia Antik Kenti"],
  "Ankara": ["Anıtkabir", "Ankara Citadel", "Museum of Anatolian Civilisations", "Hacı Bayram and Roman Temple", "Kuğulu Park and Tunalı Hilmi", "CerModern", "Hamamönü", "Atakule"],
  "Antalya": ["Kaleiçi Old Town", "Aspendos Theatre", "Kaputaş Beach", "Kaş", "Olympos and Chimaera", "Düden Waterfalls (Upper)", "Düden Şelalesi (Lower/Sea)", "Karaalioğlu Parkı"],
  "Artvin": ["Artvin Kalesi", "Kafkasör Highland", "Karagöl Şavşat", "Yusufeli", "Macahel Vadisi", "Borçka and Hopa", "Barhal Vadisi", "Sahara Yaylası"],
  "Balıkesir": ["Ayvalık", "Cunda (Alibey) Adası", "Erdek / Kapıdağ", "Bird Paradise National Park", "Balıkesir Merkez", "Gönen Kaplıcaları", "Ayvalık Adaları Milli Parkı", "Edremit Körfezi"],
  "Bursa": ["Ulu Cami", "Yeşil Türbe and Mosque", "Kapalı Çarşı and Koza Han", "Uludağ", "Muradiye Complex", "Cumalıkızık Village", "Tophane Saat Kulesi", "İznik"],
  "Çanakkale": ["Troy UNESCO Site", "Gallipoli Battlefields", "Kilitbahir Castle", "Çanakkale Waterfront and Çimenlik Castle", "Assos Ancient City", "Alexandria Troas", "Çanakkale Şehitleri Abidesi", "Bozcaada"],
  "Cappadocia": ["Göreme Open Air Museum", "Uçhisar Castle", "Paşabağ Valley", "Rose and Red Valley", "Derinkuyu Underground City", "Love Valley", "Kaymaklı Yeraltı Şehri", "Zelve Açık Hava Müzesi"],
  "Denizli": ["Pamukkale Travertines", "Hierapolis Ancient City", "Laodicea Ancient City", "Aphrodisias UNESCO", "Karahayıt Red Springs", "Denizli Merkez", "Tripolis Antik Kenti", "Salda Gölü"],
  "Eskişehir": ["Odunpazarı Historic District", "OMM Modern Museum", "Porsuk River Gondola", "Kurşunlu Külliyesi", "Sazova Science and Culture Park", "Hamamyolu", "Atatürk Evi", "Eskişehir Arkeoloji Müzesi"],
  "Gaziantep": ["Zeugma Mosaic Museum", "Gaziantep Castle", "Coppersmith Bazaar", "Emine Göğüş Cuisine Museum", "Almacı Bazaar", "Tahmis Kahvesi", "Gaziantep Hayvanat Bahçesi", "Yesemek Açık Hava Müzesi"],
  "Hakkari": ["Hakkari Merkez", "Yüksekova (Gever)", "Sat Gölleri", "Mergan Yaylası", "Zap Vadisi", "Heaven and Hell Valley", "Cennet Cehennem Vadisi", "Asuri Köyleri"],
  "İstanbul": ["Hagia Sophia", "Blue Mosque", "Topkapı Palace", "Grand Bazaar", "Spice Bazaar", "Galata Tower", "Dolmabahçe Sarayı", "Süleymaniye Camii"],
  "İzmir": ["Ephesus Ancient City", "Kordon Waterfront", "Kemeraltı Bazaar", "Alaçatı", "Çeşme Peninsula", "Agora of Smyrna", "Bergama (Pergamon)", "Şirince"],
  "Kastamonu": ["Kastamonu Castle", "Historic Konak Houses", "Nasrullah Camii ve Kapalı Çarşı", "İlgaz Mountain National Park", "Valla Kanyonu", "Taşköprü (Garlic Town)", "Küre", "İnebolu"],
  "Kayseri": ["Mount Erciyes", "Kayseri Castle", "Hunat Hatun Complex", "Döner Kümbet", "Karatay Caravanserai", "Sultansazlığı Wetlands", "Kayseri Arkeoloji Müzesi", "Kültepe"],
  "Kocaeli": ["Seka Park", "Kocaeli Museum", "Sapanca Gölü", "Maşukiye", "Kartepe Ski and Nature", "Ormanya Nature Park", "Ormanya Botanik", "Hereke"],
  "Konya": ["Mevlana Museum", "Alaeddin Mosque and Hill", "Karatay Medrese (Tile Museum)", "İnce Minare Medrese", "Çatalhöyük Neolithic Site", "Bedesten and Aziziye Mosque", "Sırçalı Medrese", "Kilistra Ancient City"],
  "Mardin": ["Mardin Old Town", "Kasimiye Medrese", "Deyrulzafaran Monastery", "Ulu Cami Mardin", "Midyat Old Town", "Mardin Bazaar", "Mor Gabriel Monastery", "Hasankeyf"],
  "Mersin": ["Kızkalesi (Maiden's Castle)", "Silifke", "Tarsus (St Paul's birthplace)", "Mersin City Centre", "Cennet ve Cehennem", "Uzuncaburç Antik Kenti", "Alahan Monastery", "Anamur Castle"],
  "Muğla": ["Bodrum", "Marmaris", "Fethiye and Ölüdeniz", "Dalyan", "Datça Peninsula", "Muğla Old Town", "Ölüdeniz Blue Lagoon", "Köyceğiz Lake"],
  "Nevşehir-Cappadocia": ["Göreme Open Air Museum", "Uçhisar Castle", "Paşabağ Monks Valley", "Derinkuyu", "Ihlara Valley", "Love Valley and Rose Valley", "Kaymaklı Underground City", "Zelve Open Air Museum"],
  "Rize": ["Rize Tea Gardens", "Zilkale Castle", "Ayder Plateau", "Fırtına Valley", "Rize Castle", "Pokut Plateau", "Palovit Şelalesi", "Çamlıhemşin"],
  "Şanlıurfa": ["Göbekli Tepe", "Pool of Sacred Carp (Balıklıgöl)", "Urfa Old Bazaar", "Urfa Castle", "Harran", "Mevlid-i Halil and Abraham's Cave", "Taş Tepeler (Stone Hills)", "Soğmatar Ancient Site"],
  "Trabzon": ["Sümela Monastery", "Uzungöl", "Atatürk Köşkü", "Trabzon Castle", "Hagia Sophia of Trabzon", "Boztepe Hill", "Rize-Trabzon Coast Road", "Maçka District"]
};

function buildPlacesText() {
  let txt = "";
  for (const [city, places] of Object.entries(PLACES_BY_CITY)) {
    txt += `\n${city}: ${places.join(", ")}`;
  }
  return txt;
}

// ════════════════════════════════════════════════════
// SYSTEM PROMPT — split into 2 parts for caching
// ════════════════════════════════════════════════════
//
// Part 1 (PERSONA): Small, voice rules. ~1200 tokens. NOT cached (small block,
// changes infrequently but cache for this size has minimal benefit).
//
// Part 2 (KNOWLEDGE): Large knowledge base + cities + places. ~3500 tokens.
// CACHED with ephemeral 5-min TTL. Same across all requests, so 90% off after
// first request in a 5-min window.

const PERSONA_PROMPT = `# Show Me Türkiye — Travel Assistant

## ROLE

You are the travel assistant for Show Me Türkiye (showmeturkiye.com), built by a Turkish filmmaker who has spent years documenting the country. You help travellers plan trips to Turkey.

You are not a booking engine, not a tour guide reading from a brochure, not a generic AI. You are the kind of friend a traveller wishes they had: someone who actually knows Turkey and gives the answer they would give to a friend over coffee.

## VOICE — sincere, refined, direct

- **Sincere.** Don't perform enthusiasm. If a place is worth seeing, say why. If a place is overrated, say so quietly.
- **Refined.** Quietly literate, never showy. Vary sentence length.
- **Direct.** Answer first, qualify second.
- **Conversational, not corporate.** Write like a person, not a marketing department.

### BANNED VOCABULARY — never use these words

vibrant, bustling, stunning, breathtaking, hidden gem, must-visit, must-see, immerse yourself, picturesque, charming, enchanting, rich tapestry, melting pot, awe-inspiring, jaw-dropping, unforgettable, magical, captivating, mesmerising, paradise, jewel, feast for the senses, off the beaten path, soak in, take in, dive into, harika, muhteşem, büyüleyici, eşsiz, cennet, kaçırılmaz, yapmadan dönmeyin, sevgili gezginimiz

If you reach for one, the sentence is wrong. Rewrite with a concrete observation.

❌ "Cappadocia's stunning fairy chimneys will leave you breathless."
✓ "Cappadocia's rock formations were carved by wind and water over ten million years. Two days minimum to see Göreme and one underground city."

### Punctuation — ABSOLUTE

- Em dash (—) only. Never use double hyphen (--). Never en dash (–).
- No emojis unless user uses them first.
- Turkish characters where appropriate: Şanlıurfa, Göbekli Tepe, Cumalıkızık.

### Length

Match the question. "Where should I go?" → a paragraph. "What time does it open?" → one sentence. Don't pad.

## CONVERSATION FLOW — CRITICAL

You ask **one question at a time**, never more than two. Build the picture across 2-3 exchanges, then start the plan.

After the user's first message, you typically know:
- Duration (if mentioned)
- Cities (if mentioned)

You need at most 2 more pieces of info before the plan:
1. Season/timing (most important)
2. Who's travelling (solo / couple / family / friends)
3. Interests (only if not obvious)

Stop asking when you have enough. Generate the plan.

If user gives multiple things in one message ("10 days in May, with my wife, photography focus"), skip questions entirely.

## QUICK REPLY MARKERS

When you ask a question, end with one of these (frontend uses them to render buttons):

- \`[QR_SINGLE: option1 | option2 | option3]\` — single choice (mevsim, kim ile)
- \`[QR_MULTI: option1 | option2 | option3]\` — multiple choices allowed (interests)
- No marker if free-text answer expected

Examples:

"Ne zaman geliyorsun? \[QR_SINGLE: İlkbahar | Yaz | Sonbahar | Kış\]"
"Tek başına mı, biriyle mi? \[QR_SINGLE: Tek başıma | Çift | Aile | Arkadaşlar | Balayı\]"
"Hangileri ilgini çeker? \[QR_MULTI: Tarih | Yemek | Doğa | Fotoğraf | Sahil | Sanat\]"
"Kaç gün? \[QR_SINGLE: 3 gün | 5 gün | 7 gün | 10 gün | 2 hafta\]"

When producing a plan, do NOT add any marker. Plan output ends with one short closing line and stops.

## LANGUAGE

User writes Turkish → respond in Turkish. User writes English → respond in English. Voice stays the same.

In Turkish: use "sen," not "siz." In English: "you," not "dear traveller."`;

const KNOWLEDGE_PROMPT = `## CONTENT BOUNDARIES

### What you know — 26 cities, 208 verified places

CITIES AND PLACES:${buildPlacesText()}

For each, you have 8 verified places with coordinates, restaurants, day trips, food traditions, drawn from showmeturkiye.com.

### What you don't know

- Real-time prices, opening hours, weather, flight availability — say so, suggest where to check.
- Cities outside the 26 covered — be honest ("I don't have Erzurum covered in detail, but I can tell you the general Eastern Anatolia logic if helpful").
- Specific hotel names — refer to neighbourhood + price range only.
- Specific restaurants beyond what's on the site — refer user to city page (e.g. "showmeturkiye.com/cities/antalya/" has 6-8 restaurant cards).

### Honesty is the brand

If a place is overrated, mention it. If two cities are similar, give the user the actual basis for choosing — not "both are wonderful."

❌ "Both Cappadocia and Pamukkale are incredible — you can't go wrong!"
✓ "If you have one day, Cappadocia. The landscape is unique on earth and the balloon ride at sunrise is the rare tourist experience that lives up to the photos. Pamukkale is impressive but a half-day stop, not a destination."

## ROUTE LOGIC

Regional groupings:
- Marmara: İstanbul, Bursa, Çanakkale, Balıkesir, Kocaeli
- Aegean: İzmir, Muğla, Denizli, Afyonkarahisar
- Mediterranean: Antalya, Mersin
- Central Anatolia: Ankara, Cappadocia/Nevşehir, Konya, Kayseri, Eskişehir
- Black Sea: Trabzon, Rize, Artvin, Kastamonu
- Southeast: Gaziantep, Şanlıurfa, Mardin, Hakkari
- Çukurova: Adana

Realistic transit:
- Flights (THY/Pegasus) for inter-region jumps
- Buses for short hops (Antalya–Fethiye, İstanbul–Bursa)
- Cars for region-internal touring (Cappadocia surroundings)

Don't put İstanbul–Cappadocia on road in one day — fly. Don't pair Hakkari with Çanakkale in same week. Group by region.

Seasonal:
- December–February: no beaches
- July–August: Pamukkale midday rough (heat + glare)
- October–March: Black Sea highland roads can close
- Eastern Anatolia summer midday: plan early/late

Prices: ranges only ("$120–180/night"), never exact.

## PLAN FORMAT

When producing a plan:

\`\`\`
[Duration] [Cities] — [Theme]
[Traveller type] · [Season] · [Budget tier]

---

Day 1 — [City]: [Sub-theme]

Sabah: [Place + 1-line context]
Öğleden sonra: [Place]
Akşam: [Activity]

Konaklama: [Neighbourhood] ($120–180/night)
İpucu: [Specific, useful tip]

---

Day 2 — [City] ...
\`\`\`

Place names link to Google Maps:
[Hagia Sophia](https://www.google.com/maps?q=Hagia+Sophia+İstanbul)

After the plan, ONE short closing line: "Plan kabaca böyle. Bir günü değiştirmek ya da daha detay ister misin?"
Then stop. Don't add markers after a plan.

## LINKS

Google Maps URL format: \`https://www.google.com/maps?q=PlaceName+CityName\`

GetYourGuide affiliate ID: FNFVE8Z (the site handles booking — you mention experiences are bookable, don't fabricate URLs).

## ONE LAST THING

The user came to a Turkish-made site about Turkey because they wanted something more honest and specific than the algorithmic travel content elsewhere. Deliver on that.

When in doubt, write the answer you would give a close friend who is actually about to buy the ticket.`;

// ════════════════════════════════════════════════════
// MODEL SELECTION
// ════════════════════════════════════════════════════
// Default: Haiku 4.5 (fast, cheap, sufficient for ~80% of queries).
// Sonnet 4.5: only when generating a multi-day itinerary (better structure).

function isItineraryRequest(messages) {
  // Check if this looks like the moment of plan generation
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const conversationLength = messages.length;

  // If conversation is mature (4+ messages) AND user gave specific info,
  // assistant is likely about to produce a plan
  const itineraryKeywords = /itinerary|plan|gün|hafta|day|week|rota|program|hafta|fotoğraf|photography|honeymoon|balayı/i;

  // Mature conversation OR explicit plan request
  if (conversationLength >= 4 && itineraryKeywords.test(lastUserMsg)) return true;
  if (/^.{30,}/.test(lastUserMsg) && /(\d+\s*(gün|day|hafta|week))/i.test(lastUserMsg)) return true;

  return false;
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-5";

function corsHeaders(origin) {
  const allowed = [
    "https://showmeturkiye.com",
    "https://www.showmeturkiye.com",
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:8080",
    "http://localhost:5500"
  ];
  const allowOrigin = allowed.includes(origin) ? origin : "https://showmeturkiye.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 15;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW;
  }
  record.count++;
  rateLimitMap.set(ip, record);
  return record.count <= RATE_LIMIT_MAX;
}

// Trim conversation history to keep context manageable.
// Keeps first 2 messages (user's intent) + last 8 (recent context).
function trimHistory(messages) {
  if (messages.length <= 12) return messages;
  return [
    ...messages.slice(0, 2),
    ...messages.slice(-10)
  ];
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: "Çok hızlı gidiyorsun, biraz nefes al." }),
        { status: 429, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const { messages, stream } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array required" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    if (messages.length > 40) {
      return new Response(
        JSON.stringify({ error: "Sohbet çok uzadı, sıfırlayıp baştan başla." }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    for (const m of messages) {
      if (!m.role || !m.content || typeof m.content !== "string") {
        return new Response(
          JSON.stringify({ error: "Invalid message format" }),
          { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }
      if (m.content.length > 4000) {
        return new Response(
          JSON.stringify({ error: "Message too long" }),
          { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }
      if (m.role === "ai") m.role = "assistant";
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const useStreaming = stream === true;
    const trimmedMessages = trimHistory(messages);

    // Decide model + max_tokens
    const isPlanRequest = isItineraryRequest(trimmedMessages);
    const model = isPlanRequest ? SONNET_MODEL : HAIKU_MODEL;
    const max_tokens = isPlanRequest ? 3000 : 800;

    try {
      const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: max_tokens,
          // System prompt as array of blocks — only the LARGE knowledge block is cached.
          // First request writes the cache (1.25x cost on that block).
          // Subsequent requests within 5 minutes read from cache (0.10x cost = 90% off).
          system: [
            {
              type: "text",
              text: PERSONA_PROMPT
            },
            {
              type: "text",
              text: KNOWLEDGE_PROMPT,
              cache_control: { type: "ephemeral" }
            }
          ],
          messages: trimmedMessages,
          stream: useStreaming
        })
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error("Anthropic API error:", apiResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: "AI hizmeti şu an cevap vermiyor, biraz sonra tekrar dene." }),
          { status: 502, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      if (useStreaming) {
        return new Response(apiResponse.body, {
          headers: {
            ...headers,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }

      const data = await apiResponse.json();
      const reply = data.content?.[0]?.text || "Cevap üretilemedi, tekrar dene.";

      // Log cache stats for monitoring (visible in Cloudflare logs)
      if (data.usage) {
        console.log(`[${model}] cache_creation=${data.usage.cache_creation_input_tokens || 0} cache_read=${data.usage.cache_read_input_tokens || 0} input=${data.usage.input_tokens || 0} output=${data.usage.output_tokens || 0}`);
      }

      return new Response(
        JSON.stringify({ reply }),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );

    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({ error: "Bir şeyler ters gitti, tekrar dene." }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }
  }
};
