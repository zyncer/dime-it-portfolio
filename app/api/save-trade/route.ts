import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const tradeData = await req.json();

    // Calculate the final THB cost securely on the backend
    const calculatedCostThb = 
      (tradeData.shares * tradeData.price_usd * tradeData.fx_rate_used) + 
      (tradeData.commission_usd * tradeData.fx_rate_used);

    // 1. Write to upload_history table
    const { data: uploadLog, error: uploadError } = await supabase
      .from('upload_history')
      .insert({
        file_name: tradeData.fileName,
        file_hash: tradeData.fileHash,
        status: 'Processed'
      })
      .select()
      .single();

    if (uploadError) throw uploadError;

    // 2. Write to portfolio_transactions table
    const { error: tradeError } = await supabase
      .from('portfolio_transactions')
      .insert({
        timestamp: new Date().toISOString(), // Or extract from PDF if available
        ticker: tradeData.ticker,
        action: 'Buy', // Assuming Buy for this example; adjust logic as needed
        shares: tradeData.shares,
        price_usd: tradeData.price_usd,
        funding_currency: 'THB',
        commission_usd: tradeData.commission_usd,
        fx_rate_used: tradeData.fx_rate_used,
        total_cost_thb: calculatedCostThb,
        upload_id: uploadLog.upload_id
      });

    if (tradeError) throw tradeError;

    return NextResponse.json({ success: true, message: 'Trade committed to database.' });

  } catch (error) {
    console.error("Commit error:", error);
    return NextResponse.json({ error: 'Failed to commit trade data.' }, { status: 500 });
  }
}