# AI LICHIDITATE — Prompt 07b: Web Grounding pentru Chat

## Context

Chat-ul AI funcționează cu function calling pe datele contului. Această extensie adaugă **Google Search Grounding** — Gemini poate căuta pe internet în timp real și combina rezultatele cu datele din cont.

Rezultat: AI-ul poate răspunde la întrebări ca:
- "FED a anunțat ceva această săptămână? Cum postez?"
- "Cum se compară engagement-ul meu cu media din industrie?"
- "Ce se întâmplă pe piețe azi? Ar trebui să postez despre asta?"

## SCOPE BOUNDARY

Acest prompt face TREI lucruri:
1. Upgrade model de la `gemini-2.5-flash` la `gemini-3.5-flash` (necesar pentru function calling + grounding combinat)
2. Adaugă `googleSearch: {}` în tools array din API route-ul de chat
3. Actualizează UI pentru a afișa sursele web citate de Gemini

Nu se schimbă altceva — nici tool functions, nici DB, nici alte pagini.

## Carry-over (LOCKED)

- Toate tool functions existente (getAccountKpis, getTopPosts, etc.) — neatinse
- Tot UI-ul de chat — doar adăugăm afișarea surselor
- System prompt — doar o mică adăugire
- DB schema — neschimbată

## Files allowed to change

- `src/app/api/chat/message/route.ts` — adaugă googleSearch în tools + upgrade model
- `src/ai/chat/system-prompt.ts` — adaugă instrucțiuni pentru web search
- `src/components/chat/MessageBubble.tsx` — afișează sursele citate
- `fork-config.ts` — actualizează model name
- `.env.example` — nici o schimbare (același API key funcționează)

## DO NOT TOUCH

- Tool functions (`src/ai/chat/tools.ts`)
- Chat UI (ChatInterface, ConversationList, MessageInput, etc.)
- Toate celelalte pagini
- DB schema
- Analyses runner (analizele periodice rămân pe gemini-2.5-flash pentru cost)

---

## Deliverable 1: Upgrade model pentru chat

**Notă importantă:** Upgrade-ul modelului se face DOAR pentru chat, nu pentru analizele periodice. Analizele (Weekly Summary, Patterns, Ideation) rămân pe `gemini-2.5-flash` (mai ieftin, suficient pentru batch processing). Chat-ul trece pe `gemini-3.5-flash` pentru că necesită combinarea function calling cu grounding.

Actualizează `src/app/api/chat/message/route.ts`:

```ts
// Schimbă DOAR această linie:
const GEMINI_MODEL = 'gemini-3.5-flash';  // was 'gemini-2.5-flash'
```

Actualizează `fork-config.ts` — adaugă un câmp separat pentru chat model:

```ts
ai: {
  provider: 'gemini',
  model: 'gemini-2.5-flash',        // pentru analize (batch, cron)
  chatModel: 'gemini-3.5-flash',    // pentru chat (function calling + grounding)
  analysisLocale: 'ro',
},
```

Actualizează `src/lib/fork-config-types.ts` să includă `chatModel: string` în `ai` section.

---

## Deliverable 2: Adaugă Google Search Grounding în chat

În `src/app/api/chat/message/route.ts`, găsește secțiunea unde se construiește request-ul Gemini. Adaugă `{ googleSearch: {} }` în array-ul de tools:

```ts
// ÎNAINTE:
const toolsForGemini = {
  functionDeclarations: CHAT_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  })),
};

// ...în request body:
tools: [toolsForGemini],

// DUPĂ:
const functionDeclarationsForGemini = {
  functionDeclarations: CHAT_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  })),
};

// ...în request body:
tools: [
  functionDeclarationsForGemini,
  { googleSearch: {} },           // ← adaugă asta
],
```

Asta e toată schimbarea în logica de chat. Gemini decide automat:
- Când să apeleze tool functions (date din cont)
- Când să caute pe Google (informații externe)
- Când să combine ambele

**Extrage grounding metadata din răspunsul Gemini:**

Răspunsul Gemini include `groundingMetadata` când a făcut search. Trebuie să-l capturezi și să-l trimiți la client pentru afișare:

```ts
// După ce primești răspunsul Gemini (în agentic loop, la final):
const groundingMetadata = geminiJson.candidates?.[0]?.groundingMetadata;
const webSources = groundingMetadata?.groundingChunks
  ?.filter((chunk: any) => chunk.web)
  .map((chunk: any) => ({
    title: chunk.web.title,
    uri: chunk.web.uri,
  })) ?? [];

// Trimite sursele la client în events stream:
if (webSources.length > 0) {
  send({ type: 'sources', sources: webSources });
}

// Salvează și în DB (în chat_messages la asistant message):
await supabase.from('chat_messages').insert({
  conversation_id: convId,
  role: 'assistant',
  content: finalText,
  tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
  tool_results: allToolResults.length > 0 ? allToolResults : null,
  // Adaugă sursele web în tool_results pentru stocare:
  // (refolosim coloana tool_results pentru orice metadata extra)
});
```

**Actualizează tipul `ChatMessage` în `src/ai/chat/types.ts`** să includă sursele web opțional:

```ts
export interface ChatMessage {
  // ... existing fields ...
  webSources?: Array<{ title: string; uri: string }>;
}
```

---

## Deliverable 3: Actualizează system prompt

În `src/ai/chat/system-prompt.ts`, adaugă o secțiune despre web search:

```ts
## Cum folosești Google Search

Caută pe Google când utilizatorul întreabă despre:
- Știri financiare recente (ce a anunțat FED, BCE, earnings etc.)
- Benchmarks de industrie (media engagement creators financiari)
- Evenimente de piață actuale (ce s-a întâmplat azi/săptămâna asta)
- Tendințe de conținut (ce funcționează în nișa financiară în 2026)

COMBINARE OBLIGATORIE: Când întrebarea implică atât date externe cât și date din cont, 
folosește AMBELE surse și sintetizează răspunsul:
"Conform [sursă web], media industriei e X%. 
Contul tău are Y% — cu Z% [mai bun/mai slab] față de medie."

CITARE: Când folosești date de pe web, menționează sursa concis:
"Conform Hootsuite Benchmark Report 2026, ER mediu pentru creatori financiari..."
Nu inventa statistici — citează sursa sau spune "conform datelor disponibile".
```

---

## Deliverable 4: Afișare surse în UI

În `src/components/chat/ChatInterface.tsx`, adaugă state pentru surse:

```ts
const [currentSources, setCurrentSources] = useState<Array<{title: string; uri: string}>>([]);

// În event stream handler:
} else if (data.type === 'sources') {
  setCurrentSources(data.sources);
}

// La done event, atașează sursele la mesajul final:
setMessages(prev => [...prev, {
  // ... existing message fields ...
  webSources: currentSources,
}]);
setCurrentSources([]);
```

În `src/components/chat/MessageBubble.tsx`, afișează sursele sub mesajele assistant care au `webSources`:

```tsx
{message.webSources && message.webSources.length > 0 && (
  <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border-default)', paddingTop: 8 }}>
    <Mono tone="muted" style={{ fontSize: 10, marginBottom: 6 }}>
      SURSE WEB
    </Mono>
    {message.webSources.map((source, i) => (
      
        key={i}
        href={source.uri}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--color-text-muted)',
          textDecoration: 'none',
          marginBottom: 4,
          fontFamily: 'var(--font-jetbrains-mono)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        → {source.title || source.uri}
      </a>
    ))}
  </div>
)}
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm dev` starts fără erori
3. **Model upgrade:** `console.log(GEMINI_MODEL)` în route → afișează `gemini-3.5-flash`
4. **Google Search activ:** întreabă "Ce a anunțat FED în mai 2026?" — răspunsul trebuie să conțină informații specifice recente, nu doar cunoștințe generale
5. **Surse afișate:** când Gemini face search, sub mesaj apare secțiunea "SURSE WEB" cu link-uri clickabile
6. **Combinare date:** întreabă "Cum se compară engagement-ul meu cu media din industrie?" — răspunsul trebuie să conțină ATÂT datele tale (getAccountKpis) CÂT ȘI benchmark-uri de pe web
7. **Tool functions neatinse:** întreabă "Care sunt top postările mele?" — funcționează ca înainte, fără web search
8. **Analizele periodice neatinse:** generează un Weekly Summary — funcționează cu `gemini-2.5-flash`, nu cu `gemini-3.5-flash`
9. **Fără regresii:** toate paginile existente funcționează
10. **Cost rezonabil:** web grounding e gratuit până la 1500 queries/zi pe free tier

## Notes pentru Claude Code

- `gemini-3.5-flash` vs `gemini-2.5-flash`: sunt modele diferite cu pricing diferit. Asigură-te că modelul pentru analize (`ai.model` din fork-config) și cel pentru chat (`ai.chatModel`) sunt citiți din locuri diferite.
- `groundingMetadata` există în răspuns DOAR când Gemini a făcut efectiv search. Handle gracefully când e undefined.
- Dacă combinarea function calling + googleSearch nu funcționează pe `gemini-2.5-flash` (posibil pe unele versiuni API), fallback: dezactivează function calling când googleSearch e activ și invers (bazat pe natura întrebării din system prompt).
- Sursele web pot fi goale chiar dacă grounding e activat — Gemini decide singur dacă face search sau nu.