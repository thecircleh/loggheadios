import React from 'react';
import AdCourtBottom from './AdCourtBottom';
import { Link } from 'react-router-dom';

const AdsPreviewPage = () => {
  return (
    <div className="min-h-screen bg-white text-gray-800 p-6 md:p-12 flex flex-col items-center justify-center">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4">Loggerhead: Track Volleyball Stats Live</h1>
        <p className="text-lg mb-6">
          Loggerhead is a powerful, mobile-friendly stat tracking platform built for parents, coaches, and players.
          Whether you're at the court or reviewing film at home, Loggerhead helps you log digs, aces, kills,
          substitutions, and every rally in real time.
        </p>

        <ul className="text-left list-disc list-inside mb-6 text-base md:text-lg">
          <li>✅ Touch-optimized UI for mobile devices</li>
          <li>✅ Track stats like kills, assists, digs, errors, aces, and blocks</li>
          <li>✅ Export to PDF/CSV, view team summaries, and drill into player performance</li>
          <li>✅ Perfect for parents, coaches, and stat keepers at every level</li>
        </ul>

        <Link to="/register" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow">
          Create Your Free Account
        </Link>

        <div className="mt-8">
          <AdCourtBottom />
        </div>
      </div>

    </div>
  );
};

export default AdsPreviewPage;