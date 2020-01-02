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
}

export interface IConfigDevprod {
    productId?: number;
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
        if (typeof(result.products) !== "object" || !Array.isArray(result.products)) {
            throw new ConfigError("Bad or missing products array");
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

function isProductOutdated(product: IConfigDevprod) {
    if (product.productId === undefined || product.productId === null || product.uploadedHash === undefined || product.uploadedHash === null) {
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

export async function checkProducts(config: IConfig, options: IOptions) {
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
            if (isProductOutdated(product)) {
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

export async function updateProducts(config: IConfig, options: IOptions) {
    const added: IConfigDevprod[] = [];
    let outdated = 0;
    let updated = 0;
    for (const product of config.products) {
        let update = false;
        if (product.productId === undefined || product.productId === null) {
            update = options.create;
        } else {
            const isOutdated = isProductOutdated(product);
            update = options.updateAll || (options.update && isOutdated);
            if (update && isOutdated) {
                outdated++;
            }
        }
        if (update) {
            if (product.productId === undefined || product.productId === null) {
                await addProduct(config.universeId, product, options.cookie);
                added.push(product);
            } else {
                updated++;
                await updateProduct(config.universeId, product, options.cookie);
            }
        }
    }
    return {
        added: added,
        outdated: outdated,
        updated: updated,
    };
}

export function hashProducts(config: IConfig, options: IOptions) {
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
    return {
        total: total,
        updated: updated,
    };
}

export function checkHashProducts(config: IConfig, options: IOptions) {
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
    return {
        toUpdate: toUpdate,
        toNotUpdate: toNotUpdate,
    };
}
