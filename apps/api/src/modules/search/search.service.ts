import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  SearchCommonService,
  SearchOptions,
  SearchResponse,
} from "./search-common.service";
import { SearchProductService } from "./query/search-product.service";
import { SearchAutocompleteService } from "./query/search-autocomplete.service";
import { SearchCollectionService } from "./query/search-collection.service";
import { SearchSyncService } from "./indexing/search-sync.service";

// Geriye dönük uyumluluk: arama tip sözleşmeleri artık search-common.service'te
// yaşıyor; mevcut tüketiciler (search.controller vb.) bu modülden import
// etmeye devam edebilir.
export {
  ProductSearchResult,
  SearchOptions,
  SearchResponse,
  RichAutocompleteResult,
} from "./search-common.service";
import type { CronRunSummary } from "../../monitoring/cron-run.helper";

/**
 * Facade: tüm public imzalar aynen korunur, iş mantığı alt servislerde
 * (search-product / search-autocomplete / search-collection / search-sync +
 * ortak search-common). Dış modüller (search.controller, search.worker,
 * search-scheduled.processor, collection/admin/product servisleri) yalnızca
 * SearchService'i kullanmaya devam eder. Trade split'teki TradeService facade
 * deseniyle aynı.
 *
 * ES bağlantı lifecycle'ı + index ensure + repeatable-cron kaydı SearchCommonService.
 * onModuleInit'e taşındı (orijinali birebir yansıtır). Burada yalnızca boot-time
 * initial-sync tetikleyicisi kalır: Common alt servislere bağımlı olamayacağı için
 * (aksi halde Common↔alt döngüsü) setImmediate tetikleyici facade'de kalır —
 * Common.onModuleInit (client + ensure + registerRepeatableCron) facade'den önce
 * tamamlandığından esAvailable hazır ve sıra orijinaldeki gibidir.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  constructor(
    private readonly common: SearchCommonService,
    private readonly product: SearchProductService,
    private readonly autocompleteSvc: SearchAutocompleteService,
    private readonly collection: SearchCollectionService,
    private readonly sync: SearchSyncService,
  ) {}

  async onModuleInit() {
    setImmediate(() => {
      this.product.syncIndexIfEmpty();
      this.collection.syncCollectionsIndexIfEmpty();
    });
  }

  // Taşındı: search-common.service.ts — paylaşılan ES lifecycle/state + helper'lar.

  isAvailable(): boolean {
    return this.common.isAvailable();
  }

  async getStatus(): Promise<{
    elasticsearch: boolean;
    indexExists: boolean;
    documentCount: number;
    dbCount: number;
    inSync: boolean;
    message: string;
  }> {
    return this.common.getStatus();
  }

  // Taşındı: search-product.service.ts — ürün arama + indeksleme
  // (facade delege; imzalar aynen korunuyor).

  async searchProducts(options: SearchOptions): Promise<SearchResponse> {
    return this.product.searchProducts(options);
  }

  async searchProductIds(
    options: SearchOptions,
  ): Promise<{ ids: string[]; total: number }> {
    return this.product.searchProductIds(options);
  }

  async indexProduct(productId: string): Promise<void> {
    return this.product.indexProduct(productId);
  }

  async removeProduct(productId: string): Promise<void> {
    return this.product.removeProduct(productId);
  }

  async syncProduct(productId: string): Promise<void> {
    return this.product.syncProduct(productId);
  }

  async forceRecreateIndex(): Promise<void> {
    return this.product.forceRecreateIndex();
  }

  async reindexAll(): Promise<number> {
    return this.product.reindexAll();
  }

  // Taşındı: search-autocomplete.service.ts — otomatik tamamlama
  // (facade delege; imzalar aynen korunuyor).

  async autocomplete(query: string, limit = 10): Promise<string[]> {
    return this.autocompleteSvc.autocomplete(query, limit);
  }

  async autocompleteRich(query: string): Promise<{
    products: Array<{
      id: string;
      title: string;
      imageUrl?: string;
      price: number;
      brandName?: string;
    }>;
    brands: Array<{
      id: string;
      name: string;
      slug: string;
      logo?: string | null;
    }>;
    categories: Array<{ id: string; name: string; slug: string }>;
    manufacturers: Array<{
      id: string;
      name: string;
      slug: string;
      logo?: string | null;
    }>;
    carModels: Array<{
      id: string;
      name: string;
      slug: string;
      brandId: string;
    }>;
    scales: string[];
    materials: Array<{ slug: string; label: string }>;
    conditions: Array<{ value: string; label: string }>;
    suggestions: string[];
  }> {
    return this.autocompleteSvc.autocompleteRich(query);
  }

  // Taşındı: search-collection.service.ts — koleksiyon indeksleme + arama
  // (facade delege; imzalar aynen korunuyor).

  async indexCollection(collectionId: string): Promise<void> {
    return this.collection.indexCollection(collectionId);
  }

  async removeCollection(collectionId: string): Promise<void> {
    return this.collection.removeCollection(collectionId);
  }

  async reindexAllCollections(): Promise<number> {
    return this.collection.reindexAllCollections();
  }

  async searchCollections(options: {
    query?: string;
    categoryId?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    userId?: string;
    sortBy?:
      "popular" | "recent" | "name" | "items" | "items_asc" | "items_desc";
    page?: number;
    pageSize?: number;
  }): Promise<{ ids: string[]; total: number } | null> {
    return this.collection.searchCollections(options);
  }

  // Taşındı: search-sync.service.ts — periyodik ES↔DB senkron. İş metotları
  // (runHandlePeriodicSync/runHourlyReconcile) alt serviste yaşar; Bull processor
  // facade'i çağırır, facade de alt servise delege eder.

  async runHandlePeriodicSync(
    log: (msg: string) => void = () => {},
  ): Promise<CronRunSummary> {
    return this.sync.runHandlePeriodicSync(log);
  }

  async runHourlyReconcile(log: (msg: string) => void = () => {}) {
    return this.sync.runHourlyReconcile(log);
  }
}
