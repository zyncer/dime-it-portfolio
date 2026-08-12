import { NextRequest, NextResponse } from 'next/server'; // [cite: 418]
import crypto from 'crypto'; // [cite: 418]
import { createClient } from '@supabase/supabase-js'; // [cite: 418]

const BROKER_PASSWORD = "20031989"; // [cite: 419]
const supabase = createClient( // [cite: 419]
  process.env.NEXT_PUBLIC_SUPABASE_URL!, // [cite: 419]
  process.env.SUPABASE_SERVICE_ROLE_KEY! // [cite: 419]
); // [cite: 419]

export async function POST(req: NextRequest) { // [cite: 420]
  // Lazy load pdf-parse inside the function to avoid build-time DOMMatrix crashes // [cite: 420]
  // @ts-ignore // [cite: 420]
  const pdf = require('pdf-parse'); // [cite: 420]

  const formData = await req.formData(); // [cite: 421]
  const file = formData.get('file') as File; // [cite: 421]
  
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 }); // [cite: 422]

  const buffer = Buffer.from(await file.arrayBuffer()); // [cite: 422]

  // 1. Generate SHA-256 Hash // [cite: 423]
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex'); // [cite: 423]

  // 2. Prevent Duplicate Uploads // [cite: 424]
  const { data: existing } = await supabase // [cite: 424]
    .from('upload_history') // [cite: 424]
    .select('file_hash') // [cite: 424]
    .eq('file_hash', fileHash) // [cite: 424]
    .single(); // [cite: 424]

  if (existing) { // [cite: 425]
    return NextResponse.json({ error: 'This trade PDF has already been processed.' }, { status: 409 }); // [cite: 425]
  } // [cite: 426]

  // 3. Decrypt and Parse PDF Text // [cite: 426]
  try { // [cite: 426]
    const pdfData = await pdf(buffer, { password: BROKER_PASSWORD }); // [cite: 426]
    const rawText = pdfData.text; // [cite: 427]

    // 4. Extract Data with Regular Expressions // [cite: 427]
    const tradeData = { // [cite: 427]
      ticker: rawText.match(/Symbol:\s*([A-Z]+)/)?.[1] || '', // [cite: 427, 428]
      shares: parseFloat(rawText.match(/Quantity:\s*([\d,.]+)/)?.[1] || '0'), // [cite: 428]
      price_usd: parseFloat(rawText.match(/Avg Price USD:\s*([\d,.]+)/)?.[1] || '0'), // [cite: 428]
      commission_usd: parseFloat(rawText.match(/Commission USD:\s*([\d,.]+)/)?.[1] || '0'), // [cite: 428]
      fx_rate_used: parseFloat(rawText.match(/FX Rate:\s*([\d,.]+)/)?.[1] || '0'), // [cite: 428]
      fileHash, // [cite: 428]
      fileName: file.name // [cite: 428]
    }; // [cite: 428]

    return NextResponse.json({ success: true, parsed: tradeData }); // [cite: 429]
  } catch (err) { // [cite: 429]
    return NextResponse.json({ error: 'Failed to decrypt or parse PDF.' }, { status: 500 }); // [cite: 429]
  } // [cite: 430]
} // [cite: 430]