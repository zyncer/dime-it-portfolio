// 1. Safe DOMMatrix Polyfill for Next.js Node environment
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-ignore
  globalThis.DOMMatrix = class DOMMatrix {};
}

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const BROKER_PASSWORD = "20031989";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 2. Load the modern, Next.js-friendly legacy build of pdf.js
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    
    // Disable workers to force it to run purely server-side
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 3. Generate SHA-256 Hash
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // 4. Prevent Duplicate Uploads
    const { data: existing, error: supabaseError } = await supabase
      .from('upload_history')
      .select('file_hash')
      .eq('file_hash', fileHash)
      .single();

    if (supabaseError && supabaseError.code !== 'PGRST116') {
      throw new Error(`Supabase Error: ${supabaseError.message}`);
    }

    if (existing) {
      return NextResponse.json({ error: 'This trade PDF has already been processed.' }, { status: 409 });
    }

    // 5. Decrypt and Parse PDF Text using modern pdfjs-dist
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      password: BROKER_PASSWORD
    });

    const pdfDocument = await loadingTask.promise;
    const maxPages = pdfDocument.numPages;
    let rawText = "";

    // Loop through all pages and extract text natively
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const page = await pdfDocument.getPage(pageNo);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      rawText += pageText + "\n";
    }

    // 6. Extract Data with Regular Expressions
    const tradeData = {
      ticker: rawText.match(/Symbol:\s*([A-Z]+)/)?.[1] || '',
      shares: parseFloat(rawText.match(/Quantity:\s*([\d,.]+)/)?.[1] || '0'),
      price_usd: parseFloat(rawText.match(/Avg Price USD:\s*([\d,.]+)/)?.[1] || '0'),
      commission_usd: parseFloat(rawText.match(/Commission USD:\s*([\d,.]+)/)?.[1] || '0'),
      fx_rate_used: parseFloat(rawText.match(/FX Rate:\s*([\d,.]+)/)?.[1] || '0'),
      fileHash,
      fileName: file.name
    };

    return NextResponse.json({ success: true, parsed: tradeData });

  } catch (err: any) {
    console.error("CRITICAL BACKEND ERROR:", err);
    return NextResponse.json({ error: err.message || 'Unknown backend crash occurred.' }, { status: 500 });
  }
}