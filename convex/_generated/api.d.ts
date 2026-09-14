/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analysis from "../analysis.js";
import type * as dashboard from "../dashboard.js";
import type * as dbExplorer from "../dbExplorer.js";
import type * as lib_amortize from "../lib/amortize.js";
import type * as lib_analysisTypes from "../lib/analysisTypes.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_canonicalCategories from "../lib/canonicalCategories.js";
import type * as lib_carLoanConstants from "../lib/carLoanConstants.js";
import type * as lib_cashFlow from "../lib/cashFlow.js";
import type * as lib_categoryKey from "../lib/categoryKey.js";
import type * as lib_computeAnalysis from "../lib/computeAnalysis.js";
import type * as lib_loanCompute from "../lib/loanCompute.js";
import type * as lib_matchLoanPayments from "../lib/matchLoanPayments.js";
import type * as lib_periods from "../lib/periods.js";
import type * as lib_spreads from "../lib/spreads.js";
import type * as lib_tags from "../lib/tags.js";
import type * as migrations from "../migrations.js";
import type * as modules from "../modules.js";
import type * as statements from "../statements.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analysis: typeof analysis;
  dashboard: typeof dashboard;
  dbExplorer: typeof dbExplorer;
  "lib/amortize": typeof lib_amortize;
  "lib/analysisTypes": typeof lib_analysisTypes;
  "lib/auth": typeof lib_auth;
  "lib/canonicalCategories": typeof lib_canonicalCategories;
  "lib/carLoanConstants": typeof lib_carLoanConstants;
  "lib/cashFlow": typeof lib_cashFlow;
  "lib/categoryKey": typeof lib_categoryKey;
  "lib/computeAnalysis": typeof lib_computeAnalysis;
  "lib/loanCompute": typeof lib_loanCompute;
  "lib/matchLoanPayments": typeof lib_matchLoanPayments;
  "lib/periods": typeof lib_periods;
  "lib/spreads": typeof lib_spreads;
  "lib/tags": typeof lib_tags;
  migrations: typeof migrations;
  modules: typeof modules;
  statements: typeof statements;
  transactions: typeof transactions;
  users: typeof users;
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

export declare const components: {};
