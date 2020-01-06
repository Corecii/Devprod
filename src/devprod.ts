import * as objectHash from "object-hash";
import * as roblox from "./roblox";

export interface IOptions {
    create: boolean;
    update: boolean;
    updateAll: boolean;
    hash: boolean;
    cookie?: string;
}

export interface IConfig {
    universeId: number;
    products: IConfigDevprod[];
    gamepasses: IConfigDevprod[];
}

export interface IConfigDevprod {
    productId?: number;
    gamepassId?: number;
    name: string;
    description?: string;
    price?: number;
    imageId?: number;
    uploadedHash?: string;
}

export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
    }
}

function maybe(type: string, value: any) {
    if (value === undefined || value === null) {
        return true;
    }
    return typeof(value) === type;
}

export async function parseConfig(text: string) {
    try {
        const result = JSON.parse(text);
        if (typeof(result.universeId) !== "number") {
            throw new ConfigError("Bad or missing universeId");
        }
        if (result.products === undefined) {
            result.products = [];
        }
        if (result.gamepasses === undefined) {
            result.gamepasses = [];
        }
        if (typeof(result.products) !== "object" || !Array.isArray(result.products)) {
            throw new ConfigError("Bad or missing products array");
        }
        if (typeof(result.gamepasses) !== "object" || !Array.isArray(result.gamepasses)) {
            throw new ConfigError("Bad or missing gamepasses array");
        }
        let index = 0;
        for (const product of result.products) {
            if (!maybe("number", product.productId)) { throw new ConfigError(`Bad productId on product ${index}`); }
            if (typeof(product.name) !== "string") { throw new ConfigError(`Bad or missing name on product ${index}`); }
            if (!maybe("string", product.description)) { throw new ConfigError(`Bad description on product ${index}`); }
            if (!maybe("number", product.price) || product.price < 0) { throw new ConfigError(`Bad price on product ${index}`); }
            if (!maybe("number", product.imageId) || product.imageId < 0) { throw new ConfigError(`Bad imageId on product ${index}`); }
            if (!maybe("string", product.uploadedHash)) { throw new ConfigError(`Bad uploadedHash on product ${index}`); }
            index++;
        }
        index = 0;
        for (const product of result.gamepasses) {
            if (!maybe("number", product.gamepassId)) { throw new ConfigError(`Bad gamepassId on product ${index}`); }
            if (typeof(product.name) !== "string") { throw new ConfigError(`Bad or missing name on product ${index}`); }
            if (!maybe("string", product.description)) { throw new ConfigError(`Bad description on product ${index}`); }
            if (!maybe("number", product.price) || product.price < 0) { throw new ConfigError(`Bad price on product ${index}`); }
            if (!maybe("number", product.imageId) || product.imageId < 0) { throw new ConfigError(`Bad imageId on product ${index}`); }
            if (!maybe("string", product.uploadedHash)) { throw new ConfigError(`Bad uploadedHash on product ${index}`); }
            index++;
        }
        return result as IConfig;
    } catch (error) {
        throw error;
    }
}

function getHash(product: IConfigDevprod) {
    const hashProduct = {
        productId: product.productId,
        name: product.name,
        description: product.description,
        price: product.price,
        imageId: product.imageId,
    };
    return objectHash.default(hashProduct, {
        algorithm: "sha1",
        excludeValues: false,
        encoding: "base64",
        ignoreUnknown: true,
        respectFunctionProperties: false,
        respectFunctionNames: false,
        respectType: false,
        unorderedArrays: true,
        unorderedSets: true,
        unorderedObjects: true,
    });
}

function isEntryOutdated(product: IConfigDevprod) {
    if ((!product.productId && !product.gamepassId) || product.uploadedHash === undefined || product.uploadedHash === null) {
        return true;
    }
    return getHash(product) !== product.uploadedHash;
}

async function addProduct(universeId: number, product: IConfigDevprod, cookie: string) {
    try {
        const productId = await roblox.devprodAdd(universeId, {
            Name: product.name,
            Description: product.description,
            IconImageAssetId: product.imageId,
            PriceInRobux: product.price,
        }, cookie);
        product.productId = productId;
        product.uploadedHash = getHash(product);
    } catch (error) {
        throw error;
    }
}

async function updateProduct(universeId: number, product: IConfigDevprod, cookie: string) {
    if (typeof(product.productId) !== "number") {
        throw new Error("Bad or missing productId at runtime");
    }
    try {
        await roblox.devprodUpdate(universeId, product.productId, {
            Name: product.name,
            Description: product.description,
            IconImageAssetId: product.imageId,
            PriceInRobux: product.price,
        }, cookie);
        product.uploadedHash = getHash(product);
    } catch (error) {
        throw error;
    }
}

async function updateGamepass(universeId: number, product: IConfigDevprod, cookie: string) {
    if (typeof(product.gamepassId) !== "number") {
        throw new Error("Bad or missing gamepassId at runtime");
    }
    try {
        await roblox.gamepassUpdate(universeId, product.gamepassId, {
            name: product.name,
            description: product.description,
            isForSale: product.price ? product.price !== 0 : false,
            price: product.price,
        }, cookie);
        product.uploadedHash = getHash(product);
    } catch (error) {
        throw error;
    }
}

export async function checkEntries(config: IConfig, options: IOptions) {
    const toAdd = [];
    const toNotAdd = [];
    const outdated = [];
    const toUpdate = [];
    const toNotUpdate = [];
    for (const product of config.products) {
        if (product.productId === undefined || product.productId === null) {
            if (options.create) {
                toAdd.push(product);
            } else {
                toNotAdd.push(product);
            }
        } else {
            if (isEntryOutdated(product)) {
                outdated.push(product);
                if (options.update || options.updateAll) {
                    toUpdate.push(product);
                } else {
                    toNotUpdate.push(product);
                }
            } else if (options.updateAll) {
                toUpdate.push(product);
            } else {
                toNotUpdate.push(product);
            }
        }
    }
    for (const product of config.gamepasses) {
        if (product.gamepassId === undefined || product.gamepassId === null) {
            toNotAdd.push(product);
        } else {
            if (isEntryOutdated(product)) {
                outdated.push(product);
                if (options.update || options.updateAll) {
                    toUpdate.push(product);
                } else {
                    toNotUpdate.push(product);
                }
            } else if (options.updateAll) {
                toUpdate.push(product);
            } else {
                toNotUpdate.push(product);
            }
        }
    }
    return {
        toAdd: toAdd,
        toNotAdd: toNotAdd,
        outdated: outdated,
        toUpdate: toUpdate,
        toNotUpdate: toNotUpdate,
    };
}

export async function updateEntries(config: IConfig, options: IOptions) {
    const actions = await checkEntries(config, options);
    const addSuccess: IConfigDevprod[] = [];
    const addFailed: Array<{ product: IConfigDevprod, error: Error }> = [];
    const updateSuccess: IConfigDevprod[] = [];
    const updateFailed: Array<{ product: IConfigDevprod, error: Error }> = [];
    for (const product of actions.toAdd) {
        try {
            await addProduct(config.universeId, product, options.cookie);
            addSuccess.push(product);
        } catch (error) {
            addFailed.push({ product: product, error: error });
        }
    }
    for (const product of actions.toUpdate) {
        try {
            if (product.productId) {
                await updateProduct(config.universeId, product, options.cookie);
            } else if (product.gamepassId) {
                await updateGamepass(config.universeId, product, options.cookie);
            }
            updateSuccess.push(product);
        } catch (error) {
            updateFailed.push({ product: product, error: error });
        }
    }
    const result = actions as any;
    result.addSuccess = addSuccess;
    result.addFailed = addFailed;
    result.updateSuccess = updateSuccess;
    result.updateFailed = updateFailed;
    return result;
}

export function hashEntries(config: IConfig, options: IOptions) {
    let total = 0;
    let updated = 0;
    for (const product of config.products) {
        if (product.productId !== null && product.productId !== undefined) {
            total++;
            const newHash = getHash(product);
            if (newHash !== product.uploadedHash) {
                updated++;
                product.uploadedHash = newHash;
            }
        }
    }
    for (const product of config.gamepasses) {
        if (product.gamepassId !== null && product.gamepassId !== undefined) {
            total++;
            const newHash = getHash(product);
            if (newHash !== product.uploadedHash) {
                updated++;
                product.uploadedHash = newHash;
            }
        }
    }
    return {
        total: total,
        updated: updated,
    };
}

export function checkHashEntries(config: IConfig, options: IOptions) {
    const toUpdate = [];
    const toNotUpdate = [];
    for (const product of config.products) {
        if (product.productId !== null && product.productId !== undefined) {
            const newHash = getHash(product);
            if (newHash !== product.uploadedHash) {
                toUpdate.push(product);
            } else {
                toNotUpdate.push(product);
            }
        }
    }
    for (const product of config.gamepasses) {
        if (product.productId !== null && product.productId !== undefined) {
            const newHash = getHash(product);
            if (newHash !== product.uploadedHash) {
                toUpdate.push(product);
            } else {
                toNotUpdate.push(product);
            }
        }
    }
    return {
        toUpdate: toUpdate,
        toNotUpdate: toNotUpdate,
    };
}
