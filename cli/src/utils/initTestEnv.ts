import { airdropSol } from "@lightprotocol/stateless.js";
import { getPayer, setAnchorProvider } from "./utils";
import {
  BASE_PATH,
  LIGHT_MERKLE_TREE_PROGRAM_TAG,
  LIGHT_PROTOCOL_PROGRAMS_DIR_ENV,
  SPL_NOOP_PROGRAM_TAG,
} from "./constants";
import path from "path";
import { downloadBinIfNotExists } from "../psp-utils";
import {
  confirmServerStability,
  executeCommand,
  killProcess,
  waitForServers,
} from "./process";
import { startProver } from "./processProverServer";
import { startIndexer } from "./processPhotonIndexer";

export async function initTestEnv({
  additionalPrograms,
  skipSystemAccounts,
  indexer = true,
  prover = true,
  proveCompressedAccounts = true,
  proveNewAddresses = false,
  checkPhotonVersion = true,
}: {
  additionalPrograms?: { address: string; path: string }[];
  skipSystemAccounts?: boolean;
  indexer: boolean;
  prover: boolean;
  proveCompressedAccounts?: boolean;
  proveNewAddresses?: boolean;
  checkPhotonVersion?: boolean;
}) {
  console.log("Performing setup tasks...\n");

  const initAccounts = async () => {
    const anchorProvider = await setAnchorProvider();
    const payer = await getPayer();
    await airdropSol({
      connection: anchorProvider.connection,
      lamports: 100e9,
      recipientPublicKey: payer.publicKey,
    });
  };
  // We cannot await this promise directly because it will hang the process
  startTestValidator({ additionalPrograms, skipSystemAccounts });
  await waitForServers([{ port: 8899, path: "/health" }]);
  await confirmServerStability("http://127.0.0.1:8899/health");
  await initAccounts();

  if (indexer) {
    await startIndexer(checkPhotonVersion);
  }

  if (prover) {
    await startProver(proveCompressedAccounts, proveNewAddresses);
  }
}

export async function initTestEnvIfNeeded({
  additionalPrograms,
  skipSystemAccounts,
  indexer = false,
  prover = false,
}: {
  additionalPrograms?: { address: string; path: string }[];
  skipSystemAccounts?: boolean;
  indexer?: boolean;
  prover?: boolean;
} = {}) {
  try {
    const anchorProvider = await setAnchorProvider();
    // this request will fail if there is no local test validator running
    const payer = await getPayer();
    await anchorProvider.connection.getBalance(payer.publicKey);
  } catch (error) {
    // launch local test validator and initialize test environment
    await initTestEnv({
      additionalPrograms,
      skipSystemAccounts,
      indexer,
      prover,
    });
  }
}

/*
 * Determines a path to which Light Protocol programs should be downloaded.
 *
 * If the `LIGHT_PROTOCOL_PROGRAMS_DIR` environment variable is set, the path
 * provided in it is used.
 *
 * Otherwise, the `bin` directory in the CLI internals is used.
 *
 * @returns {string} Directory path for Light Protocol programs.
 */
function programsDirPath(): string {
  return (
    process.env[LIGHT_PROTOCOL_PROGRAMS_DIR_ENV] ||
    path.resolve(__dirname, BASE_PATH)
  );
}

/*
 * Determines a patch to which the given program should be downloaded.
 *
 * If the `LIGHT_PROTOCOL_PROGRAMS_DIR` environment variable is set, the path
 * provided in it is used as a parent
 *
 * Otherwise, the `bin` directory in the CLI internals is used.
 *
 * @returns {string} Path for the given program.
 */
function programFilePath(programName: string): string {
  const programsDir = process.env[LIGHT_PROTOCOL_PROGRAMS_DIR_ENV];
  if (programsDir) {
    return path.join(programsDir, programName);
  }

  return path.resolve(__dirname, path.join(BASE_PATH, programName));
}

export async function getSolanaArgs({
  additionalPrograms,
  skipSystemAccounts,
  downloadBinaries = true,
}: {
  additionalPrograms?: { address: string; path: string }[];
  skipSystemAccounts?: boolean;
  downloadBinaries?: boolean;
}): Promise<Array<string>> {
  const LIMIT_LEDGER_SIZE = "500000000";

  type Program = { id: string; name?: string; tag?: string; path?: string };
  // TODO: adjust program tags
  const programs: Program[] = [
    {
      id: "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV",
      name: "spl_noop.so",
      tag: SPL_NOOP_PROGRAM_TAG,
    },
    {
      id: "6UqiSPd2mRCTTwkzhcs1M6DGYsqHWd5jiPueX3LwDMXQ",
      name: "light_compressed_pda.so",
      tag: LIGHT_MERKLE_TREE_PROGRAM_TAG,
    },
    {
      id: "9sixVEthz2kMSKfeApZXHwuboT6DZuT6crAYJTciUCqE",
      name: "light_compressed_token.so",
      tag: LIGHT_MERKLE_TREE_PROGRAM_TAG,
    },
    {
      id: "5QPEJ5zDsVou9FQS3KCauKswM3VwBEBu4dpL9xTqkWwN",
      name: "account_compression.so",
      tag: LIGHT_MERKLE_TREE_PROGRAM_TAG,
    },
    {
      id: "5WzvRtu7LABotw1SUEpguJiKU27LRGsiCnF5FH6VV7yP",
      name: "light_registry.so",
      tag: LIGHT_MERKLE_TREE_PROGRAM_TAG,
    },
  ];
  if (additionalPrograms)
    additionalPrograms.forEach((program) => {
      programs.push({ id: program.address, path: program.path });
    });

  const dirPath = programsDirPath();

  const solanaArgs = [
    "--reset",
    `--limit-ledger-size=${LIMIT_LEDGER_SIZE}`,
    "--quiet",
  ];

  for (const program of programs) {
    if (program.path) {
      solanaArgs.push("--bpf-program", program.id, program.path);
    } else {
      const localFilePath = programFilePath(program.name!);
      if (program.name === "spl_noop.so" || downloadBinaries) {
        await downloadBinIfNotExists({
          localFilePath,
          dirPath,
          owner: "Lightprotocol",
          repoName: "light-protocol",
          remoteFileName: program.name!,
          tag: program.tag,
        });
      }
      solanaArgs.push("--bpf-program", program.id, localFilePath);
    }
  }
  if (!skipSystemAccounts) {
    const accountsRelPath = "../../accounts";
    const accountsPath = path.resolve(__dirname, accountsRelPath);
    solanaArgs.push("--account-dir", accountsPath);
  }

  return solanaArgs;
}

export async function startTestValidator({
  additionalPrograms,
  skipSystemAccounts,
}: {
  additionalPrograms?: { address: string; path: string }[];
  skipSystemAccounts?: boolean;
}) {
  const command = "solana-test-validator";
  const solanaArgs = await getSolanaArgs({
    additionalPrograms,
    skipSystemAccounts,
  });

  await killTestValidator();

  await new Promise((r) => setTimeout(r, 1000));

  console.log("Starting test validator...", command);
  await executeCommand({
    command,
    args: [...solanaArgs],
  });
}

export async function killTestValidator() {
  await killProcess("solana-test-validator");
}
