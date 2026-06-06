import { requireTeacher } from "@/lib/auth/guards";
import { streamAssessmentItems } from "@arago/ai";
import { GenerateAssessmentSchema } from "@arago/validators";

export async function POST(request: Request) {
  const { error } = await requireTeacher();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = GenerateAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const elementStream = streamAssessmentItems(parsed.data);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const item of elementStream) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ item })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
