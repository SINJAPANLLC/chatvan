import React from 'react';
import { Link } from 'wouter';

export default function LP() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center">
      <div className="relative w-full max-w-xl">
        <img
          src={`${import.meta.env.BASE_URL}lp-hero.png`}
          alt="Chat LOGI"
          className="w-full"
        />
        {/* 「無料で相談する」ボタン部分のタップ領域 */}
        <Link href="/">
          <div className="absolute bottom-[6%] left-[5%] right-[5%] h-[7%]" />
        </Link>
      </div>
    </div>
  );
}
