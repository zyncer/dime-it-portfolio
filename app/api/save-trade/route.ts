import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const tradeDataArray = await req.json();
    
    // ดึงข้อมูลพื้นฐานจากหุ้นตัวแรกมาใช้เป็นข้อมูลไฟล์
    const firstTrade = tradeDataArray[0];

    // 1. บันทึกประวัติการอัปโหลดลง upload_history แค่ 1 ครั้งต่อ 1 ไฟล์
    const { data: uploadLog, error: uploadError } = await supabase
      .from('upload_history')
      .insert({
        file_name: firstTrade.fileName,
        file_hash: firstTrade.fileHash,
        status: 'Processed'
      })
      .select()
      .single();

    if (uploadError) throw uploadError;

    // 2. จัดเตรียมข้อมูลหุ้นทุกตัวให้อยู่ในรูปแบบ Array เพื่อทำ Bulk Insert
    const transactionsToInsert = tradeDataArray.map((trade: any) => {
      const calculatedCostThb = 
        (trade.shares * trade.price_usd * trade.fx_rate_used) + 
        (trade.commission_usd * trade.fx_rate_used);

      return {
        timestamp: trade.date, // ใช้วันที่ที่ดึงมาจาก PDF โดยตรง
        ticker: trade.ticker,
        action: trade.action === 'BUY' ? 'Buy' : 'Sell',
        shares: trade.shares,
        price_usd: trade.price_usd,
        funding_currency: 'THB',
        commission_usd: trade.commission_usd,
        fx_rate_used: trade.fx_rate_used,
        total_cost_thb: calculatedCostThb,
        upload_id: uploadLog.upload_id
      };
    });

    // 3. บันทึกหุ้นทั้งหมดลง portfolio_transactions ในครั้งเดียว
    const { error: tradeError } = await supabase
      .from('portfolio_transactions')
      .insert(transactionsToInsert);

    if (tradeError) throw tradeError;

    return NextResponse.json({ success: true, message: 'All trades committed to database.' });

  } catch (error: any) {
    console.error("Commit error:", error);
    return NextResponse.json({ error: error.message || 'Failed to commit trade data.' }, { status: 500 });
  }
}