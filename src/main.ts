import * as toml from "@iarna/toml";
import * as commandLineArgs from "command-line-args";
import * as commandLineUsage from "command-line-usage";
import * as fs from "fs-extra";
import * as devprod from "./devprod";
import * as roblox from "./roblox";

function oneOf(arr: string[]) {
    return (input: string) => {
        if (arr.indexOf(input) === -1) {
            throw new Error("Expected one of " + arr.join(", "));
        }
        return input;
    };
}

const cmdOptionsDefinitions = [
    { name: "help", alias: "h", type: Boolean, description: "Display this help message", group: "main" },
    { name: "?", alias: "?", type: Boolean, description: "Display this help message", group: "main" },
    { name: "name", type: String, defaultOption: true,
    typeLabel: "{underline name}", description: "short {underline name} file name. Will read and write to {underline name.devprod.toml} or {underline name.devprod.json}", group: "file" },
    { name: "file", type: String,
    typeLabel: "{underline file}", description: "long {underline file} name. Will read and write to {underline file} directly", group: "file" },
    { name: "type", typeLabel: "{underline filetype}", type: oneOf(["auto", "toml", "json"]), description: "One of {underline auto}, {underline toml}, or {underline json}", defaultValue: "auto"},
    { name: "registry", alias: "r", type: Boolean, description: "Log in to Roblox using Roblox Studio's cookie from the registry", group: "login" },
    { name: "create", alias: "c", type: Boolean, description: "Create products that lack a productId and save the productIds to the file", group: "actions" },
    { name: "update", alias: "u", type: Boolean, description: "Update products with a productId that have new contents according to local hashes", group: "actions" },
    { name: "preview", alias: "p", type: Boolean, description: "List the to-be-updated products instead of actually updating", group: "actions" },
    { name: "updateall", type: Boolean, description: "Update all products with a productId regardless of hash-based up-to-date status", group: "actions" },
    { name: "hash", type: Boolean, description: "Update local hashes of all products to force up-to-date status", group: "actions" },
];

const cmdOptionsGuide = [
    {
        header: "Devprod",
        content: [
            "A utility to create and update Roblox Developer Products from a TOML or JSON file.",
            "Devprod requires a properly-formatted {bold X.devprod.toml} or {bold X.devprod.json} file to run.",
            "Devprod must be called with an action. One of:",
            "- any combination of {bold create}, {bold update}, {bold updateall}",
            "- or {bold hash}",
            "{bold preview} can be used to preview changes for any action",
            "",
            "For example, to create and update products for {bold game.devprod.toml} using the registry cookie, either of the following work:",
            "{bold devprod game --registry --create --update}",
            "{bold devprod game -rcu}",
        ],
    },
    {
        header: "Logging In",
        content: [
            "This utility needs to log in to Roblox to create and update developer products.",
            "You have two choices:",
            "- Retrieve the cookie from Roblox Studio's registry on Windows using the {bold -r --registry} option",
            "- Set the {bold DEVPROD_COOKIE} environment variable to the ROBLOSECURITY cookie",
            "The {bold -r --registry} arguments will take priority over the DEVPROD_COOKIE environment variable",
        ],
    },
    {
        header: "Options",
        optionList: cmdOptionsDefinitions,
    },
];

(async () => {
    let cmdOptions;
    try {
        cmdOptions = commandLineArgs.default(cmdOptionsDefinitions)._all;
    } catch (error) {
        console.error(error.message);
        console.log ("Try devprod --help");
        return;
    }

    let needsHelp = false;
    if (cmdOptions.help || cmdOptions["?"]) {
        needsHelp = true;
    } else if (!cmdOptions.name && !cmdOptions.file) {
        needsHelp = true;
    } else if (!cmdOptions.hash && !cmdOptions.create && !cmdOptions.update && !cmdOptions.updateall && !cmdOptions.preview) {
        needsHelp = true;
    }

    if (needsHelp) {
        console.log(commandLineUsage.default(cmdOptionsGuide));
        return;
    }

    let cookie;
    if (!cmdOptions.hash && !cmdOptions.preview) {
        if (cmdOptions.registry) {
            try {
                cookie = `.ROBLOSECURITY=${await roblox.getRegistryCookie()};`;
            } catch (error) {
                console.error(`Failed to get cookie from the registry: ${error.message}`);
                return;
            }
        } else if (process.env.DEVPROD_COOKIE) {
            cookie = process.env.DEVPROD_COOKIE;
            if (!cookie.startsWith(".ROBLOSECURITY=")) {
                cookie = `.ROBLOSECURITY=${cookie};`;
            }
        } else {
            needsHelp = true;
        }
    }

    if (needsHelp) {
        console.error("You need to log in to do that. Try devprod --help");
        return;
    }

    let fileName;
    let initialContentsString;
    let fileType = cmdOptions.type;

    if (cmdOptions.file) {
        if (fileType === "auto") {
            if (cmdOptions.file.endsWith(".toml")) {
                fileType = "toml";
            } else if (cmdOptions.file.endsWith(".json")) {
                fileType = "json";
            } else {
                console.error(`Failed to determine file type for ${cmdOptions.file} because: file does not have a .toml or .json extension; please specify the type with --type`);
                return;
            }
        }

        fileName = cmdOptions.file;
    } else if (cmdOptions.name) {
        if (fileType === "auto") {
            let tomlExists = false;
            let jsonExists = false;
            try {
                tomlExists = await fs.pathExists(`${cmdOptions.name}.devprod.toml`);
                jsonExists = await fs.pathExists(`${cmdOptions.name}.devprod.json`);
            } catch (error) {
                console.error(`Failed to determine file type for ${cmdOptions.name} because: ${error.message}`);
                return;
            }
            if (tomlExists && jsonExists) {
                console.error(`Failed to determine file type for ${cmdOptions.name} because: both ${cmdOptions.name}.devprod.toml and ${cmdOptions.name}.devprod.json exist`);
                return;
            }

            if (tomlExists) {
                fileType = "toml";
            } else if (jsonExists) {
                fileType = "json";
            } else {
                console.error(`Failed to determine file type for ${cmdOptions.name} because: neither ${cmdOptions.name}.devprod.toml nor ${cmdOptions.name}.devprod.json exist`);
                return;
            }
        }

        fileName = `${cmdOptions.name}.devprod.${fileType}`;
    }

    try {
        initialContentsString = await fs.readFile(fileName);
    } catch (error) {
        console.error(`Failed to open file ${fileName} because: ${error.message}`);
        return;
    }

    let config: devprod.IConfig;
    try {
        config = await devprod.parseConfig(initialContentsString, fileType);
    } catch (error) {
        console.error(`Failed to read from ${fileName} because: ${error.message}`);
        return;
    }

    const options = {
        create: cmdOptions.create ? true : false,
        update: cmdOptions.update ? true : false,
        updateAll: cmdOptions.updateall ? true : false,
        hash: cmdOptions.hash ? true : false,
        cookie: cookie,
    } as devprod.IOptions;

    const total = (config.products?.length || 0) + (config.gamepasses?.length || 0);
    if (cmdOptions.preview) {
        if (cmdOptions.hash) {
            const result = await devprod.checkHashEntries(config, options);
            console.log(`Checked ${total} entries`);
            console.log(`${result.toUpdate.length} entries to update local hashes`);
            console.log(`${result.toNotUpdate.length} entries to leave existing up-to-date hashes`);
            console.log("Actions:");
            for (const product of result.toUpdate) {
                console.log(`  NEWHASH ${product.name}`);
            }
            for (const product of result.toNotUpdate) {
                console.log(`  LEAVE ${product.name}`);
            }
        } else {
            const result = await devprod.checkEntries(config, options);
            console.log(`Checked ${total} entries`);
            console.log(`${result.toAdd.length} entries to be created`);
            console.log(`${result.toNotAdd.length} entries to not be created`);
            console.log(`${result.outdated.length} outdated entries according to local hashes`);
            console.log(`${result.toUpdate.length} entries to be updated`);
            console.log(`${result.toNotUpdate.length} entries to not be updated`);
            console.log("Actions:");
            for (const product of result.toAdd) {
                console.log(`  ADD ${product.name}`);
            }
            for (const product of result.toNotAdd) {
                console.log(`  NOADD ${product.name}`);
            }
            for (const product of result.toUpdate) {
                console.log(`  UPDATE ${product.name}`);
            }
            for (const product of result.toNotUpdate) {
                console.log(`  NOUPDATE ${product.name}`);
            }
        }
    } else if (cmdOptions.hash) {
        const result = devprod.hashEntries(config, options);
        console.log(`Checked ${total} entries`);
        console.log(`${result.total} existing entries processed`);
        console.log(`${result.total - result.updated} entry hashes already up-to-date`);
        console.log(`${result.updated} entry hashes updated`);
    } else {
        try {
            const result = await devprod.updateEntries(config, options);
            console.log(`Checked ${total} entries`);
            console.log(`${result.addSuccess.length} products created`);
            console.log(`${result.toNotAdd.length} entry creations skipped`);
            console.log(`${result.addFailed.length} products failed to create`);
            console.log(`${result.updateSuccess.length} entries updated`);
            console.log(`${result.toNotUpdate.length} entry updates skipped`);
            console.log(`${result.updateFailed.length} entries failed to update`);
            if (result.addSuccess.length > 0) {
                console.log("Created products:");
                for (const product of result.addSuccess) {
                    console.log(`  ${product.name}: ${product.productId}`);
                }
            }
            if (result.addFailed.length > 0) {
                console.log("Failed creations:");
                for (const info of result.addFailed) {
                    console.log(`  ${info.product.name}: ${info.error.message}`);
                }
            }
            if (result.updateFailed.length > 0) {
                console.log("Failed updates:");
                for (const info of result.updateFailed) {
                    console.log(`  ${info.product.name}: ${info.error.message}`);
                }
            }

            let loggedFailedVerify = false;
            function logFailedVerify() {
                if (loggedFailedVerify) {
                    return;
                }
                loggedFailedVerify = true;
                console.log("Failed verify:");
            }

            if (result.verifyFailed.length > 0) {
                logFailedVerify();
                for (const info of result.verifyFailed) {
                    console.log(`  ${info.product.name}: ${info.error.message}`);
                }
            }

            for (const info of result.verifySuccess) {
                if (info.details.name !== info.product.name) {
                    logFailedVerify();
                    console.log(`  ${info.product.name}  [NAME]: ${info.details.name}`);
                }
                if (info.details.description !== info.product.description) {
                    logFailedVerify();
                    console.log(`  ${info.product.name}  [DESC]: ${info.details.description}`);
                }
                if (info.details.price !== info.product.price) {
                    logFailedVerify();
                    console.log(`  ${info.product.name} [PRICE]: ${info.details.price}`);
                }
            }
        } catch (error) {
            console.error(`Failed to update some products because: ${error.message}`);
            console.log("Saving current config state...");
        }
    }

    if (!cmdOptions.preview) {
        let finalContentsString;
        try {
            if (fileType === "toml") {
                finalContentsString = toml.stringify(config as any);
            } else {
                finalContentsString = JSON.stringify(config, null, 4);
            }
        } catch (error) {
            console.error("Failed to convert config to json. The existing config might be missing data including new product ids. Attempting to dump config...");
            console.error(`Reason: ${error.message}`);
            console.log(config);
            return;
        }
        try {
            await fs.writeFile(fileName, finalContentsString);
        } catch (error) {
            console.error("Failed to write config to file. The existing config might be missing data including new product ids. Attempting to dump config...");
            console.error(`Reason: ${error.message}`);
            console.log(finalContentsString);
            return;
        }
    }
    console.log("Devprod done.");
})();
