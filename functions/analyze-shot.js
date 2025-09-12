// File: /functions/analyze-shot.js

export async function onRequestPost(context) {
  try {
    // Get the raw text data sent from the browser
    const fileContent = await context.request.text();
    const shotData = JSON.parse(fileContent);

    // --- PROTECTED LOGIC ---
    // This code runs on the server.
    // Any complex or secret analysis would go here.
    if (!shotData.samples || !Array.isArray(shotData.samples)) {
      throw new Error("Invalid data: 'samples' array is missing.");
    }

    // If the data is valid, send it back to the browser.
    // Cloudflare requires returning a Response object.
    return new Response(JSON.stringify(shotData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // If something goes wrong, send back an error message.
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, // Bad Request
      headers: { 'Content-Type': 'application/json' },
    });
  }
}