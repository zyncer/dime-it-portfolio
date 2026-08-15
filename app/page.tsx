'use client';

import { useState } from 'react';

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'ledger' | 'history'>('summary');

// Handle PDF Upload to the backend parser
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      // NEW: Catch severe server errors (like 404 or 500) before trying to read JSON
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setParsedData(data.parsed);
      } else {
        alert(`Upload Failed: ${data.error}`);
      }
    } catch (error: any) {
      // NEW: Force the error to pop up on your screen instead of hiding in the console
      console.error("Error parsing PDF:", error);
      alert(`Something went wrong connecting to the backend: ${error.message}`);
    } finally {
      setIsUploading(false);
      // NEW: Reset the input so you can test the exact same file multiple times
      e.target.value = ''; 
    }
  };

  // Commit Action: Save to both tables
  const confirmAndSave = async () => {
    try {
      const response = await fetch('/api/save-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedData),
      });
      
      if (response.ok) {
        alert("Trade successfully saved!");
        setParsedData(null); // Close modal
        setFile(null);
      } else {
        alert("Failed to save trade.");
      }
    } catch (error) {
      console.error("Error saving trade:", error);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      <h1 className="text-3xl font-bold">Dime It: Portfolio Tracker</h1>

      {/* Upload Dropzone Component */}
      <div className="border-4 border-dashed border-gray-300 rounded-lg p-12 text-center hover:bg-gray-50 transition">
        <h2 className="text-xl font-semibold mb-2">Upload Trade Confirmation (PDF)</h2>
        <input 
          type="file" 
          accept="application/pdf" 
          onChange={handleUpload} 
          className="mx-auto block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {isUploading && <p className="mt-4 text-blue-600">Extracting data... please wait.</p>}
      </div>

{/* Review & Confirm Modal */}
      {parsedData && parsedData.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col">
            <h3 className="text-2xl font-bold mb-4">Review Trade Details ({parsedData.length} Items)</h3>
            
            {/* ทำให้รายการเลื่อน Scroll ได้กรณีมีหุ้นหลายตัว */}
            <div className="overflow-y-auto pr-2 space-y-4 mb-6 flex-1">
              {parsedData.map((trade: any, index: number) => {
                const costTHB = (trade.shares * trade.price_usd * trade.fx_rate_used) + (trade.commission_usd * trade.fx_rate_used);
                return (
                  <div key={index} className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-gray-700">
                    <div className="flex justify-between items-center border-b pb-2 mb-2">
                      <span className={`font-bold px-2 py-1 rounded text-white text-xs ${trade.action === 'BUY' ? 'bg-green-600' : 'bg-red-600'}`}>
                        {trade.action}
                      </span>
                      <span className="font-bold text-lg">{trade.ticker}</span>
                      <span className="text-sm text-gray-500">Date: {new Date(trade.date).toLocaleDateString('en-GB')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p><strong>Shares:</strong> {trade.shares}</p>
                      <p><strong>Price (USD):</strong> ${trade.price_usd}</p>
                      <p><strong>Commission:</strong> ${trade.commission_usd}</p>
                      <p><strong>FX Rate:</strong> {trade.fx_rate_used}</p>
                    </div>
                    <p className="mt-3 text-right text-base font-semibold text-green-700">
                      Calculated THB: ฿{costTHB.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex space-x-4 pt-4 border-t">
              <button onClick={confirmAndSave} className="flex-1 bg-blue-600 text-white py-3 rounded font-semibold hover:bg-blue-700">
                Confirm & Save All
              </button>
              <button onClick={() => setParsedData(null)} className="flex-1 bg-red-100 text-red-700 py-3 rounded font-semibold hover:bg-red-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard View Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['summary', 'ledger', 'history'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium capitalize`}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </nav>
      </div>

      {/* Dashboard Views */}
      <div className="bg-gray-50 p-6 rounded-lg min-h-[300px]">
        {activeTab === 'summary' && <p><strong>Portfolio Summary Card:</strong> Net THB invested vs. current USD value converted to live THB rate will display here.</p>}
        {activeTab === 'ledger' && <p><strong>Transaction Ledger:</strong> Historical table listing all trades with funding type (THB vs. USD) will display here.</p>}
        {activeTab === 'history' && <p><strong>Upload History Tab:</strong> Logs showing previously uploaded files and timestamps will display here.</p>}
      </div>
    </div>
  );
}