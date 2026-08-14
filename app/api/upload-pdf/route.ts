// 1. THE ROBUST DOMMATRIX POLYFILL
// This proxy intercepts ANY missing methods and prevents pdf.js from crashing
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-ignore
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      return new Proxy(this, {
        get: (target, prop) => {
          if (typeof prop === 'string' && !(prop in target)) {
            // If pdf.js calls a minified math method, safely return a dummy function
            return () => new globalThis.DOMMatrix();
          }
          return Reflect.get(target, prop);
        }
      });
    }
  };
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
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Generate SHA-256 Hash
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // 2. Prevent Duplicate Uploads
    const { data: existing, error: supabaseError } = await supabase
      .from('upload_history')
      .select('file_hash')
      .eq('file_hash', fileHash)
      .single();

    // Ignore PGRST116 (which just means 0 rows found, this is a good thing for new uploads!)
    if (supabaseError && supabaseError.code !== 'PGRST116') {
      throw new Error(`Supabase Error: ${supabaseError.message}`);
    }

    if (existing) {
      return NextResponse.json({ error: 'This trade PDF has already been processed.' }, { status: 409 });
    }

    // 3. THE ULTIMATE FIX: Bypass pdf-parse wrapper and command pdf.js directly!
    // @ts-ignore
const pdfjsLib = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');

    // Pass the password DIRECTLY into the core engine where it belongs
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      password: BROKER_PASSWORD
    });

    const pdfDocument = await loadingTask.promise;
    const maxPages = pdfDocument.numPages;
    let rawText = "";

    // Manually extract the text strings from every page
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const page = await pdfDocument.getPage(pageNo);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      rawText += pageText + "\n";
    }

    // 4. Extract Data with Regular Expressions
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