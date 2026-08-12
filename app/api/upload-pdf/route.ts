// 1. THE FIX: Define the dummy DOMMatrix at the absolute top of the file!
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
    // @ts-ignore
    const pdf = require('pdf-parse');

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

    // 3. Decrypt and Parse PDF Text
    const pdfData = await pdf(buffer, { password: BROKER_PASSWORD });
    const rawText = pdfData.text;

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