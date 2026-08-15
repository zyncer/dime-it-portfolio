import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // 1. ดึงข้อมูลการเทรดทั้งหมดจากฐานข้อมูล
    const { data: trades, error: tradesError } = await supabase
      .from('portfolio_transactions')
      .select('*');

    if (tradesError) throw tradesError;

    // 2. ดึงอัตราแลกเปลี่ยน USD-THB ล่าสุด (ถ้ายังไม่มี cron job จะใช้ค่า default 33.15 ไปก่อน)
    const { data: fxData } = await supabase
      .from('fx_rates')
      .select('rate')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    const currentFxRate = fxData ? Number(fxData.rate) : 33.15;

    // 3. คำนวณต้นทุนทั้งหมด (THB) และมูลค่าสินทรัพย์ที่มีอยู่ (USD)
    let totalInvestedTHB = 0;
    let totalAssetsUSD = 0;

    (trades || []).forEach((trade: any) => {
      if (trade.action === 'Buy') {
        totalInvestedTHB += Number(trade.total_cost_thb);
        // ต้นทุน USD = (จำนวนหุ้น * ราคา) + ค่าธรรมเนียม
        totalAssetsUSD += (Number(trade.shares) * Number(trade.price_usd)) + Number(trade.commission_usd);
      } else if (trade.action === 'Sell') {
        // อนาคตถ้ามีการขาย จะต้องเอามาหักลบตรงนี้
      }
    });

    // 4. ประเมินมูลค่าพอร์ตปัจจุบันเป็นเงินบาท (อิงตาม FX วันนี้)
    const currentValueTHB = totalAssetsUSD * currentFxRate;
    const unrealizedPnL = currentValueTHB - totalInvestedTHB;
    const pnlPercentage = totalInvestedTHB > 0 ? (unrealizedPnL / totalInvestedTHB) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalInvestedTHB,
        totalAssetsUSD,
        currentFxRate,
        currentValueTHB,
        unrealizedPnL,
        pnlPercentage,
        tradeCount: trades?.length || 0
      }
    });

  } catch (error: any) {
    console.error("Summary API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch portfolio summary' }, { status: 500 });
  }
}