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

    // 2. ดึงอัตราแลกเปลี่ยน USD-THB ล่าสุด
    const { data: fxData } = await supabase
      .from('fx_rates')
      .select('rate')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    const currentFxRate = fxData ? Number(fxData.rate) : 33.15;

    // 3. ตัวแปรเก็บภาพรวม และ Object สำหรับจัดกลุ่มตาม Symbol
    let totalInvestedTHB = 0;
    let totalAssetsUSD = 0;
    const symbolData: Record<string, any> = {};

    (trades || []).forEach((trade: any) => {
      const ticker = trade.ticker;
      
      // ถ้ายังไม่มี Ticker นี้ใน Object ให้สร้างใหม่
      if (!symbolData[ticker]) {
        symbolData[ticker] = { ticker, shares: 0, investedTHB: 0, investedUSD: 0 };
      }

      if (trade.action.toUpperCase() === 'BUY') {
        const costTHB = Number(trade.total_cost_thb);
        const costUSD = (Number(trade.shares) * Number(trade.price_usd)) + Number(trade.commission_usd);
        
        // ยอดรวมทั้งพอร์ต
        totalInvestedTHB += costTHB;
        totalAssetsUSD += costUSD;

        // ยอดรวมแยกตาม Symbol
        symbolData[ticker].shares += Number(trade.shares);
        symbolData[ticker].investedTHB += costTHB;
        symbolData[ticker].investedUSD += costUSD;
      }
      // อนาคตหากมี SELL ให้เอามาหักลบ
    });

    // 4. แปลง Object แยกตาม Symbol ให้เป็น Array พร้อมคำนวณ P&L รายตัว (อิงผลกระทบจากค่าเงิน)
    const bySymbol = Object.values(symbolData).map((stock: any) => {
      const currentValueTHB = stock.investedUSD * currentFxRate;
      const unrealizedPnL = currentValueTHB - stock.investedTHB;
      const pnlPercentage = stock.investedTHB > 0 ? (unrealizedPnL / stock.investedTHB) * 100 : 0;
      
      return {
        ...stock,
        currentValueTHB,
        unrealizedPnL,
        pnlPercentage
      };
    });

    // 5. คำนวณ P&L ภาพรวมทั้งพอร์ต
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
        tradeCount: trades?.length || 0,
        bySymbol // ส่งข้อมูลที่แยกตามราย Symbol กลับไปให้ Frontend ด้วย
      }
    });

  } catch (error: any) {
    console.error("Summary API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch portfolio summary' }, { status: 500 });
  }
}