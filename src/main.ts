import * as commandLineArgs from "command-line-args";
import * as commandLineUsage from "command-line-usage";
import * as fs from "fs-extra";
import * as devprod from "./devprod";
import * as roblox from "./roblox";

const cmdOptionsDefinitions = [
    { name: "help", alias: "h", type: Boolean, description: "Display this help message", group: "main" },
    { name: "?", alias: "?", type: Boolean, description: "Display this help message", group: "main" },
    { name: "name", type: String, defaultOption: true,
    typeLabel: "{underline name}", description: "short {underline name} file name. Will read and write to {underline name.devprod.json}", group: "file" },
    { name: "file", type: String,
    typeLabel: "{underline file}", description: "long {underline file} name. Will read and write to {underline file} directly", group: "file" },
    { name: "registry", alias: "r", type: Boolean, description: "Log in to Roblox using Roblox Studio's cookie from the registry", group: "login" },
    { name: "create", alias: "c", type: Boolean, description: "Create products that lack a productId and save the productIds to the file", group: "actions" },
    { name: "update", alias: "u", type: Boolean, description: "Update products with a productId that have new contents according to local hashes", group: "actions" },
    { name: "preview", alias: "p", type: Boolean, description: "List the to-be-updated products instead of actually updating", group: "actions" },
    { name: "updateall", type: Boolean, description: "Update all products with a productId regardless of hash-based up-to-date status", group: "actions" },
    { name: "hash", type: Boolean, description: "Update local hashes of all products to force up-to-date status", group: "actions" },
];

const cmdOptionsGuide = [
    {
        header: "Devprod (ts)",
        content: [
            "A utility to create and update Roblox Developer Products from a JSON file.",
            "Devprod requires a properly-formatted {bold X.devprod.json} file to run.",
            "Devprod must be called with an action. One of:",
            "- any combination of {bold create}, {bold update}, {bold updateall}",
            "- or {bold hash}",
            "{bold preview} can be used to preview changes for any action",
            "",
            "For example, to create and update products for {bold game.devprod.json} using the registry cookie, either of the following work:",
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
    const cmdOptions = commandLineArgs.default(cmdOptionsDefinitions)._all;

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

    const fileName = cmdOptions.file || `${cmdOptions.name}.devprod.json`;

    let initialContentsString;
    try {
        initialContentsString = await fs.readFile(fileName);
    } catch (error) {
        console.error(`Failed to open file ${fileName} because: ${error.message}`);
        return;
    }

    let config: devprod.IConfig;
    try {
        config = await devprod.parseConfig(initialContentsString);
    } catch (error) {
        console.error(`Failed to read json from ${fileName} because: ${error.message}`);
        return;
    }

    const options = {
        create: cmdOptions.create ? true : false,
        update: cmdOptions.update ? true : false,
        updateAll: cmdOptions.updateall ? true : false,
        hash: cmdOptions.hash ? true : false,
        cookie: cookie,
    } as devprod.IOptions;

    if (cmdOptions.preview) {
        if (cmdOptions.hash) {
            const result = await devprod.checkHashProducts(config, options);
            console.log(`Checked ${config.products.length} products`);
            console.log(`${result.toUpdate.length} products to update local hashes`);
            console.log(`${result.toNotUpdate.length} products to leave existing up-to-date hashes`);
            console.log("Actions:");
            for (const product of result.toUpdate) {
                console.log(`  NEWHASH ${product.name}`);
            }
            for (const product of result.toNotUpdate) {
                console.log(`  LEAVE ${product.name}`);
            }
        } else {
            const result = await devprod.checkProducts(config, options);
            console.log(`Checked ${config.products.length} products`);
            console.log(`${result.toAdd.length} products to be created`);
            console.log(`${result.toNotAdd.length} products to not be created`);
            console.log(`${result.outdated.length} outdated products according to local hashes`);
            console.log(`${result.toUpdate.length} products to be updated`);
            console.log(`${result.toNotUpdate.length} products to not be updated`);
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
        const result = devprod.hashProducts(config, options);
        console.log(`Checked ${config.products.length} products`);
        console.log(`${result.total} existing products processed`);
        console.log(`${result.total - result.updated} product hashes already up-to-date`);
        console.log(`${result.updated} product hashes updated`);
    } else {
        try {
            const result = await devprod.updateProducts(config, options);
            console.log(`Checked ${config.products.length} products`);
            console.log(`${result.added.length + result.updated} total products processed`);
            console.log(`${result.added.length} products created`);
            console.log(`${result.outdated} outdated products updated`);
            console.log(`${result.updated - result.outdated} up-to-date products force-updated`);
            if (result.added.length > 0) {
                console.log("Created products:");
                for (const product of result.added) {
                    console.log(`  ${product.name}: ${product.productId}`);
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
            finalContentsString = JSON.stringify(config, null, 4);
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
