import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';
import { buildChatSystemPrompt } from '@/ai/chat/system-prompt';
import { CHAT_TOOLS, executeTool } from '@/ai/chat/tools';
import { env } from '@/lib/env';
import forkConfig from '../../../../../fork-config';

const GEMINI_MODEL = forkConfig.ai.chatModel;
const MAX_TOOL_ROUNDS = 5;

async function callGemini(
  apiKey: string,
  model: string,
  body: object,
): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as {
    message: string;
    conversationId: string | null;
    accountId: string;
  };

  const { message, conversationId, accountId } = body;

  const { data: account } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  let convId = conversationId;
  if (!convId) {
    const { data: conv } = await supabase
      .from('chat_conversations')
      .insert({
        user_id: user.id,
        account_id: accountId,
        title: message.slice(0, 60),
        last_message_preview: message.slice(0, 100),
      })
      .select('id')
      .single();
    convId = conv!.id;
  }

  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(20);

  await supabase.from('chat_messages').insert({
    conversation_id: convId,
    role: 'user',
    content: message,
  });

  const systemPrompt = buildChatSystemPrompt({
    displayName: account.display_name,
    handle: account.handle ?? account.display_name,
    platform: account.provider_id,
    followerCount: null,
  });

  const contents = [
    ...(history ?? []).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const functionDeclarationsForGemini = {
    functionDeclarations: CHAT_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  };

  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY!;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // ── PASS 1: Function calling — collect account data ──────────────
        let currentContents = contents;
        let toolRound = 0;
        let pass1Text = '';
        const allToolCalls: object[] = [];
        const allToolResults: object[] = [];
        const collectedToolData: Array<{ name: string; result: unknown }> = [];

        while (toolRound < MAX_TOOL_ROUNDS) {
          const res1 = await callGemini(apiKey, GEMINI_MODEL, {
            contents: currentContents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [functionDeclarationsForGemini],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
          });

          if (!res1.ok) {
            const errText = await res1.text();
            console.error('[chat] pass1 Gemini error:', errText);
            let userMessage = 'Eroare la generarea răspunsului.';
            try {
              const errJson = JSON.parse(errText);
              const status = errJson?.error?.status;
              if (status === 'UNAVAILABLE' || res1.status === 503) {
                userMessage = 'Serviciul AI este temporar suprasolicitat. Încearcă din nou în câteva secunde.';
              } else if (status === 'RESOURCE_EXHAUSTED' || res1.status === 429) {
                userMessage = 'Limita de utilizare a fost atinsă. Încearcă din nou mai târziu.';
              }
            } catch {}
            send({ type: 'error', message: userMessage });
            controller.close();
            return;
          }

          const json1 = await res1.json() as any;
          const candidate1 = json1.candidates?.[0];
          const parts1 = candidate1?.content?.parts ?? [];

          const functionCalls = parts1.filter((p: any) => p.functionCall);
          const textParts1 = parts1.filter((p: any) => p.text);

          if (functionCalls.length > 0) {
            send({ type: 'tool_start', tools: functionCalls.map((p: any) => p.functionCall.name) });

            const toolResponseParts = [];
            for (const part of functionCalls) {
              const { name, args } = part.functionCall;
              allToolCalls.push({ name, args });

              let result: unknown;
              try {
                result = await executeTool(name, args, { userId: user.id, accountId });
                console.log(`[chat] tool ${name} ok`);
              } catch (err) {
                result = { error: err instanceof Error ? err.message : 'Tool execution failed' };
                console.error(`[chat] tool ${name} failed:`, err);
              }

              allToolResults.push({ name, result });
              collectedToolData.push({ name, result });

              const responseObj = Array.isArray(result) ? { items: result } : (result as object ?? {});
              toolResponseParts.push({ functionResponse: { name, response: responseObj } });
            }

            currentContents = [
              ...currentContents,
              { role: 'model', parts: parts1 },
              { role: 'user', parts: toolResponseParts },
            ];

            toolRound++;
            continue;
          }

          // Pass 1 produced a text answer (no web search needed for this question)
          if (textParts1.length > 0) {
            pass1Text = textParts1.map((p: any) => p.text).join('');
          }
          break;
        }

        // ── PASS 2: Google Search — web grounding ────────────────────────
        // Only run if tools were called (account data was fetched).
        // Inject the account data as context so Gemini can compare with web.
        let finalText = pass1Text;
        let webSources: Array<{ title: string; uri: string }> = [];

        if (collectedToolData.length > 0) {
          const accountDataContext = collectedToolData
            .map(({ name, result }) => `[${name}]: ${JSON.stringify(result)}`)
            .join('\n');

          const pass2SystemPrompt = systemPrompt +
            `\n\n## Date din contul utilizatorului (deja colectate)\n\n${accountDataContext}\n\nFolosește aceste date împreună cu rezultatele din Google Search pentru a da un răspuns complet și comparat.`;

          const res2 = await callGemini(apiKey, GEMINI_MODEL, {
            contents: [{ role: 'user', parts: [{ text: message }] }],
            systemInstruction: { parts: [{ text: pass2SystemPrompt }] },
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          });

          if (res2.ok) {
            const json2 = await res2.json() as any;
            const candidate2 = json2.candidates?.[0];
            const textParts2 = (candidate2?.content?.parts ?? []).filter((p: any) => p.text);

            if (textParts2.length > 0) {
              finalText = textParts2.map((p: any) => p.text).join('');
            }

            const groundingMetadata = candidate2?.groundingMetadata;
            webSources = (groundingMetadata?.groundingChunks ?? [])
              .filter((chunk: any) => chunk.web)
              .map((chunk: any) => ({ title: chunk.web.title, uri: chunk.web.uri }));
          } else {
            // Pass 2 failed — fall back to pass 1 text answer
            console.warn('[chat] pass2 web search failed, using pass1 answer');
          }
        }

        // Stream final text word by word
        const words = finalText.split(' ');
        for (let i = 0; i < words.length; i++) {
          const chunk = i === 0 ? words[i] : ' ' + words[i];
          send({ type: 'chunk', text: chunk });
          await new Promise(r => setTimeout(r, 15));
        }

        if (webSources.length > 0) {
          send({ type: 'sources', sources: webSources });
        }

        // Persist to DB
        await supabase.from('chat_messages').insert({
          conversation_id: convId,
          role: 'assistant',
          content: finalText,
          tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
          tool_results: allToolResults.length > 0 ? allToolResults : null,
        });

        await supabase
          .from('chat_conversations')
          .update({
            last_message_preview: finalText.slice(0, 100),
            updated_at: new Date().toISOString(),
          })
          .eq('id', convId);

        send({ type: 'done', conversationId: convId });
        controller.close();

      } catch (err) {
        console.error('[chat] stream error:', err);
        send({ type: 'error', message: 'A apărut o eroare neașteptată.' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
