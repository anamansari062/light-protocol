"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.initLookUpTable = exports.initLookUpTableFromFile = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@project-serum/anchor"));
const spl_token_1 = require("@solana/spl-token");
const chai_1 = require("chai");
const bigint_buffer_1 = require("bigint-buffer");
const fs_1 = require("fs");
const constants_1 = require("../constants");
// TODO: create cli function to create a lookup table for apps
// Probably only works for testing
// TODO: extend with custom accounts to add
function initLookUpTableFromFile(
  provider,
  path = `lookUpTable.txt`,
  extraAccounts
) {
  return __awaiter(this, void 0, void 0, function* () {
    const recentSlot = (yield provider.connection.getSlot("confirmed")) - 10;
    const payerPubkey = constants_1.ADMIN_AUTH_KEYPAIR.publicKey;
    var [lookUpTable] = yield web3_js_1.PublicKey.findProgramAddress(
      [
        payerPubkey.toBuffer(),
        (0, bigint_buffer_1.toBufferLE)(BigInt(recentSlot), 8),
      ],
      web3_js_1.AddressLookupTableProgram.programId
    );
    try {
      let lookUpTableRead = new web3_js_1.PublicKey(
        (0, fs_1.readFileSync)(path, "utf8")
      );
      let lookUpTableInfoInit = yield provider.connection.getAccountInfo(
        lookUpTableRead
      );
      if (lookUpTableInfoInit) {
        lookUpTable = lookUpTableRead;
      }
    } catch (e) {
      console.log(e);
    }
    let LOOK_UP_TABLE = yield initLookUpTable(
      provider,
      lookUpTable,
      recentSlot,
      extraAccounts
    );
    (0, fs_1.writeFile)(path, LOOK_UP_TABLE.toString(), function (err) {
      if (err) {
        return console.error(err);
      }
    });
    return LOOK_UP_TABLE; //new Promise((resolveOuter) => {LOOK_UP_TABLE});
  });
}
exports.initLookUpTableFromFile = initLookUpTableFromFile;
function initLookUpTable(
  provider,
  lookupTableAddress,
  recentSlot,
  extraAccounts
) {
  return __awaiter(this, void 0, void 0, function* () {
    var lookUpTableInfoInit = null;
    if (lookupTableAddress != undefined) {
      lookUpTableInfoInit = yield provider.connection.getAccountInfo(
        lookupTableAddress
      );
    }
    if (lookUpTableInfoInit == null) {
      console.log("recentSlot: ", recentSlot);
      const payerPubkey = constants_1.ADMIN_AUTH_KEYPAIR.publicKey;
      const createInstruction =
        web3_js_1.AddressLookupTableProgram.createLookupTable({
          authority: payerPubkey,
          payer: payerPubkey,
          recentSlot,
        })[0];
      let escrows = (yield web3_js_1.PublicKey.findProgramAddress(
        [anchor.utils.bytes.utf8.encode("escrow")],
        constants_1.verifierProgramZero.programId
      ))[0];
      let ix0 = web3_js_1.SystemProgram.transfer({
        fromPubkey: constants_1.ADMIN_AUTH_KEYPAIR.publicKey,
        toPubkey: constants_1.AUTHORITY,
        lamports: 10000000000,
      });
      var transaction = new web3_js_1.Transaction().add(createInstruction);
      const addressesToAdd = [
        constants_1.AUTHORITY,
        web3_js_1.SystemProgram.programId,
        constants_1.merkleTreeProgram.programId,
        constants_1.DEFAULT_PROGRAMS.rent,
        constants_1.PRE_INSERTED_LEAVES_INDEX,
        spl_token_1.TOKEN_PROGRAM_ID,
        constants_1.REGISTERED_POOL_PDA_SPL_TOKEN,
        constants_1.MERKLE_TREE_KEY,
        escrows,
        constants_1.TOKEN_AUTHORITY,
        constants_1.REGISTERED_POOL_PDA_SOL,
        constants_1.verifierProgramTwoProgramId,
      ];
      for (var i in extraAccounts) {
        addressesToAdd.push(extraAccounts[i]);
      }
      const extendInstruction =
        web3_js_1.AddressLookupTableProgram.extendLookupTable({
          lookupTable: lookupTableAddress,
          authority: payerPubkey,
          payer: payerPubkey,
          addresses: addressesToAdd,
        });
      transaction.add(extendInstruction);
      transaction.add(ix0);
      // transaction.add(ix1);
      let recentBlockhash = yield provider.connection.getRecentBlockhash(
        "confirmed"
      );
      transaction.feePayer = payerPubkey;
      transaction.recentBlockhash = recentBlockhash;
      try {
        yield (0, web3_js_1.sendAndConfirmTransaction)(
          provider.connection,
          transaction,
          [constants_1.ADMIN_AUTH_KEYPAIR],
          constants_1.confirmConfig
        );
      } catch (e) {
        console.log("e : ", e);
      }
      console.log("lookupTableAddress: ", lookupTableAddress.toBase58());
      let lookupTableAccount = yield provider.connection.getAccountInfo(
        lookupTableAddress,
        "confirmed"
      );
      (0, chai_1.assert)(lookupTableAccount != null);
    }
    return lookupTableAddress;
  });
}
exports.initLookUpTable = initLookUpTable;
