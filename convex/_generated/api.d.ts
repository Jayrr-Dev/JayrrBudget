/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiByok from "../aiByok.js";
import type * as aiRules from "../aiRules.js";
import type * as aiUsage from "../aiUsage.js";
import type * as analysis from "../analysis.js";
import type * as auth from "../auth.js";
import type * as budgets from "../budgets.js";
import type * as canvasScenes from "../canvasScenes.js";
import type * as categorization from "../categorization.js";
import type * as classifications from "../classifications.js";
import type * as dashboard from "../dashboard.js";
import type * as dbExplorer from "../dbExplorer.js";
import type * as email from "../email.js";
import type * as featureFlags from "../featureFlags.js";
import type * as http from "../http.js";
import type * as issues from "../issues.js";
import type * as lib_aiCostTable from "../lib/aiCostTable.js";
import type * as lib_amortize from "../lib/amortize.js";
import type * as lib_analysisTypes from "../lib/analysisTypes.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_canonicalCategories from "../lib/canonicalCategories.js";
import type * as lib_carLoanConstants from "../lib/carLoanConstants.js";
import type * as lib_cashFlow from "../lib/cashFlow.js";
import type * as lib_categorization from "../lib/categorization.js";
import type * as lib_categorizationMemory from "../lib/categorizationMemory.js";
import type * as lib_categoryKey from "../lib/categoryKey.js";
import type * as lib_cleanMerchantDescriptor from "../lib/cleanMerchantDescriptor.js";
import type * as lib_computeAnalysis from "../lib/computeAnalysis.js";
import type * as lib_descriptorCategoryFixes from "../lib/descriptorCategoryFixes.js";
import type * as lib_ensureMerchant from "../lib/ensureMerchant.js";
import type * as lib_ensureModules from "../lib/ensureModules.js";
import type * as lib_loanCompute from "../lib/loanCompute.js";
import type * as lib_loanTypes from "../lib/loanTypes.js";
import type * as lib_matchLoanPayments from "../lib/matchLoanPayments.js";
import type * as lib_merchantSlug from "../lib/merchantSlug.js";
import type * as lib_merchantTxnCount from "../lib/merchantTxnCount.js";
import type * as lib_moduleCatalog from "../lib/moduleCatalog.js";
import type * as lib_openRouterModels from "../lib/openRouterModels.js";
import type * as lib_paymentFrequency from "../lib/paymentFrequency.js";
import type * as lib_periods from "../lib/periods.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_seedCategoryPaths from "../lib/seedCategoryPaths.js";
import type * as lib_seedSharedTags from "../lib/seedSharedTags.js";
import type * as lib_seedStarterTaxonomy from "../lib/seedStarterTaxonomy.js";
import type * as lib_servicePlans from "../lib/servicePlans.js";
import type * as lib_spreads from "../lib/spreads.js";
import type * as lib_tags from "../lib/tags.js";
import type * as lib_taxonomyDescriptions from "../lib/taxonomyDescriptions.js";
import type * as lib_taxonomyPath from "../lib/taxonomyPath.js";
import type * as lib_txnCodes from "../lib/txnCodes.js";
import type * as lib_userIcons from "../lib/userIcons.js";
import type * as lib_utcKeys from "../lib/utcKeys.js";
import type * as loanDocuments from "../loanDocuments.js";
import type * as merchants from "../merchants.js";
import type * as migrations from "../migrations.js";
import type * as modules from "../modules.js";
import type * as piggyCrew from "../piggyCrew.js";
import type * as piggyMemory from "../piggyMemory.js";
import type * as piggyPings from "../piggyPings.js";
import type * as polar from "../polar.js";
import type * as revenue from "../revenue.js";
import type * as scratchNotes from "../scratchNotes.js";
import type * as service from "../service.js";
import type * as statements from "../statements.js";
import type * as transactions from "../transactions.js";
import type * as userMetrics from "../userMetrics.js";
import type * as userNotes from "../userNotes.js";
import type * as users from "../users.js";
import type * as vaults from "../vaults.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiByok: typeof aiByok;
  aiRules: typeof aiRules;
  aiUsage: typeof aiUsage;
  analysis: typeof analysis;
  auth: typeof auth;
  budgets: typeof budgets;
  canvasScenes: typeof canvasScenes;
  categorization: typeof categorization;
  classifications: typeof classifications;
  dashboard: typeof dashboard;
  dbExplorer: typeof dbExplorer;
  email: typeof email;
  featureFlags: typeof featureFlags;
  http: typeof http;
  issues: typeof issues;
  "lib/aiCostTable": typeof lib_aiCostTable;
  "lib/amortize": typeof lib_amortize;
  "lib/analysisTypes": typeof lib_analysisTypes;
  "lib/auth": typeof lib_auth;
  "lib/canonicalCategories": typeof lib_canonicalCategories;
  "lib/carLoanConstants": typeof lib_carLoanConstants;
  "lib/cashFlow": typeof lib_cashFlow;
  "lib/categorization": typeof lib_categorization;
  "lib/categorizationMemory": typeof lib_categorizationMemory;
  "lib/categoryKey": typeof lib_categoryKey;
  "lib/cleanMerchantDescriptor": typeof lib_cleanMerchantDescriptor;
  "lib/computeAnalysis": typeof lib_computeAnalysis;
  "lib/descriptorCategoryFixes": typeof lib_descriptorCategoryFixes;
  "lib/ensureMerchant": typeof lib_ensureMerchant;
  "lib/ensureModules": typeof lib_ensureModules;
  "lib/loanCompute": typeof lib_loanCompute;
  "lib/loanTypes": typeof lib_loanTypes;
  "lib/matchLoanPayments": typeof lib_matchLoanPayments;
  "lib/merchantSlug": typeof lib_merchantSlug;
  "lib/merchantTxnCount": typeof lib_merchantTxnCount;
  "lib/moduleCatalog": typeof lib_moduleCatalog;
  "lib/openRouterModels": typeof lib_openRouterModels;
  "lib/paymentFrequency": typeof lib_paymentFrequency;
  "lib/periods": typeof lib_periods;
  "lib/roles": typeof lib_roles;
  "lib/seedCategoryPaths": typeof lib_seedCategoryPaths;
  "lib/seedSharedTags": typeof lib_seedSharedTags;
  "lib/seedStarterTaxonomy": typeof lib_seedStarterTaxonomy;
  "lib/servicePlans": typeof lib_servicePlans;
  "lib/spreads": typeof lib_spreads;
  "lib/tags": typeof lib_tags;
  "lib/taxonomyDescriptions": typeof lib_taxonomyDescriptions;
  "lib/taxonomyPath": typeof lib_taxonomyPath;
  "lib/txnCodes": typeof lib_txnCodes;
  "lib/userIcons": typeof lib_userIcons;
  "lib/utcKeys": typeof lib_utcKeys;
  loanDocuments: typeof loanDocuments;
  merchants: typeof merchants;
  migrations: typeof migrations;
  modules: typeof modules;
  piggyCrew: typeof piggyCrew;
  piggyMemory: typeof piggyMemory;
  piggyPings: typeof piggyPings;
  polar: typeof polar;
  revenue: typeof revenue;
  scratchNotes: typeof scratchNotes;
  service: typeof service;
  statements: typeof statements;
  transactions: typeof transactions;
  userMetrics: typeof userMetrics;
  userNotes: typeof userNotes;
  users: typeof users;
  vaults: typeof vaults;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
};
