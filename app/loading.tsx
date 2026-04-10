import React from "react";

export default function Loading() {
  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden bg-slate-50">
      
      {/* 0. Header Skeleton (Fixo no topo) */}
      <div className="fixed top-0 left-0 w-full z-50 py-6 bg-transparent pointer-events-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="w-40 h-10 bg-slate-800/50 rounded-xl animate-pulse"></div>
          <div className="hidden md:flex gap-8">
            <div className="w-24 h-4 bg-slate-800/50 rounded animate-pulse"></div>
            <div className="w-24 h-4 bg-slate-800/50 rounded animate-pulse"></div>
            <div className="w-24 h-4 bg-slate-800/50 rounded animate-pulse"></div>
          </div>
          <div className="hidden md:flex gap-6">
            <div className="w-16 h-4 bg-slate-800/50 rounded animate-pulse"></div>
            <div className="w-32 h-10 bg-slate-800/50 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* 1. Hero Skeleton Centralizado (SaaS Style) */}
      <section className="relative w-full bg-[#030712] pt-32 pb-16 lg:pt-40 lg:pb-24 border-b border-white/5">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Textos Centralizados */}
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-8 z-10 relative">
            <div className="w-64 h-8 bg-slate-800/60 rounded-full animate-pulse"></div>
            
            <div className="space-y-4 w-full flex flex-col items-center">
              <div className="w-full h-12 sm:h-16 lg:h-20 bg-slate-800/60 rounded-2xl animate-pulse max-w-3xl"></div>
              <div className="w-4/5 h-12 sm:h-16 lg:h-20 bg-slate-800/60 rounded-2xl animate-pulse max-w-2xl"></div>
            </div>

            <div className="space-y-3 w-full flex flex-col items-center">
              <div className="w-3/4 h-6 bg-slate-800/40 rounded-md animate-pulse"></div>
              <div className="w-2/4 h-6 bg-slate-800/40 rounded-md animate-pulse"></div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center w-full pt-4">
              <div className="w-full sm:w-56 h-14 bg-slate-800/60 rounded-full animate-pulse"></div>
              <div className="w-full sm:w-56 h-14 bg-slate-800/40 rounded-full animate-pulse"></div>
            </div>
          </div>

          {/* Card Wide Skeleton */}
          <div className="relative max-w-5xl mx-auto mt-20 lg:mt-24 z-20">
            <div className="bg-slate-900/80 border border-slate-800/50 rounded-3xl p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row items-center gap-8 animate-pulse h-auto md:h-[400px]">
              {/* Imagem Placeholder */}
              <div className="w-full md:w-1/3 aspect-square sm:aspect-video md:aspect-square bg-slate-800/50 rounded-2xl shrink-0"></div>
              
              {/* Textos do Produto Placeholder */}
              <div className="w-full md:w-2/3 flex flex-col space-y-6">
                <div className="w-32 h-6 bg-slate-800/60 rounded-full"></div>
                <div className="w-full h-10 bg-slate-800/60 rounded-lg"></div>
                <div className="w-5/6 h-10 bg-slate-800/60 rounded-lg"></div>
                <div className="w-full h-24 bg-slate-800/40 rounded-xl mt-6"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Value Proposition Skeleton (Dark Mode) */}
      <section className="relative w-full bg-slate-900 py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-start animate-pulse">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 mb-6"></div>
                <div className="w-48 h-6 bg-slate-800/60 rounded mb-3"></div>
                <div className="w-full h-4 bg-slate-800/40 rounded mb-2"></div>
                <div className="w-full h-4 bg-slate-800/40 rounded mb-2"></div>
                <div className="w-2/3 h-4 bg-slate-800/40 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}