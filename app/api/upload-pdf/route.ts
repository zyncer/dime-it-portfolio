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

    // ADD THESE THREE LINES TO DEBUG:
    console.log("=== START RAW PDF TEXT ===");
    console.log(rawText);
    console.log("=== END RAW PDF TEXT ===");

    // 6. Extract Data with Regular Expressions
// 6. Extract Data with Regular Expressions (แบบ Loop ทุกรายการ)
    
    // ค้นหาอัตราแลกเปลี่ยน (FX Rate) และวันที่
    const fxMatch = rawText.match(/\d{2}\s+[A-Za-z]+\s+\d{4}\s+([\d.]+)/);
    const fx_rate_used = fxMatch ? parseFloat(fxMatch[1]) : 0;
    
    const dateMatch = rawText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    let tradeDate = new Date().toISOString();
    if (dateMatch) {
      // แปลงวันที่จาก DD/MM/YYYY เป็นมาตรฐาน ISO เพื่อไม่ให้ฐานข้อมูลสับสน
      const [_, day, month, year] = dateMatch;
      tradeDate = new Date(`${year}-${month}-${day}T12:00:00Z`).toISOString();
    }

    // ใช้ matchAll เพื่อกวาดข้อมูลทุกบรรทัดที่มีคำสั่ง BUY หรือ SELL
    const tradeRegex = /(BUY|SELL)\s+([A-Z0-9]+)\s+\[[A-Z]+\]\s+([\d.,]+)\s+([\d.,]+)\s+USD\s+[\d.,]+\s+([\d.,]+)/g;
    const tradeMatches = [...rawText.matchAll(tradeRegex)];

    // แปลงข้อมูลที่กวาดมาได้ทั้งหมดให้อยู่ในรูปแบบ Array
    const tradeDataArray = tradeMatches.map(match => ({
      action: match[1], // BUY หรือ SELL
      date: tradeDate,
      ticker: match[2],
      shares: parseFloat(match[3].replace(/,/g, '')),
      price_usd: parseFloat(match[4].replace(/,/g, '')),
      commission_usd: parseFloat(match[5].replace(/,/g, '')),
      fx_rate_used: fx_rate_used,
      fileHash,
      fileName: file.name
    }));

    if (tradeDataArray.length === 0) {
      throw new Error("อ่านข้อมูลหุ้นไม่พบ กรุณาตรวจสอบรูปแบบ PDF");
    }

    // ส่งข้อมูลกลับไปเป็น Array
    return NextResponse.json({ success: true, parsed: tradeDataArray });

  } catch (err: any) {
    console.error("CRITICAL BACKEND ERROR:", err);
    return NextResponse.json({ error: err.message || 'Unknown backend crash occurred.' }, { status: 500 });
  }
}