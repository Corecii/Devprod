
import * as BeautifulDom from "beautiful-dom";
import * as request from "request-promise";

interface IDevprodUpdateOptions {
    Name?: string;
    Description?: string;
    IconImageAssetId?: number;
    PriceInRobux?: number;
}

interface IGamepassUpdateOptions {
    id?: number;
    name?: string;
    description?: string;
    isForSale?: boolean;
    price?: number;
}

export class DevprodError extends Error {
    public code: number;
    public raw?: any;
    constructor(code: number, message: string, raw?: any) {
        super(message);
        this.code = code;
        this.raw = raw;
    }

}

let lastToken: string | undefined;
export async function robloxRequest(options: request.Options) {
    if (!options.headers) {
        options.headers = { };
    }
    options.headers["x-csrf-token"] = lastToken;
    if (options.json === undefined) {
        options.json = true;
    }
    const resolveWithFullResponse = options.resolveWithFullResponse;
    options.resolveWithFullResponse = true;
    try {
        const response = await request.default(options);
        if (response.headers["x-csrf-token"]) {
            lastToken = response.headers["x-csrf-token"];
        }
        options.resolveWithFullResponse = resolveWithFullResponse;
        if (resolveWithFullResponse) {
            return response;
        } else {
            return response.body;
        }
    } catch (error) {
        options.resolveWithFullResponse = resolveWithFullResponse;
        if (error.response?.headers["x-csrf-token"]) {
            lastToken = error.response?.headers["x-csrf-token"];
        }
        const retry = error.response?.statusCode === 403 && (error.response?.statusMessage === "XSRF Token Validation Failed" || error.response?.statusMessage === "Token Validation Failed");
        if (retry) {
            options.headers["x-csrf-token"] = lastToken;
            return await request.default(options);
        }
        throw error;
    }
}

export async function getRegistryCookie() {
    try {
        const Registry: WinregStatic = require("winreg");
        const regKey = new Registry({
            hive: Registry.HKCU,
            key: "\\Software\\Roblox\\RobloxStudioBrowser\\roblox.com",
        });
        const cookieItem: Winreg.RegistryItem = await new Promise((resolve, reject) => {
            regKey.get(".ROBLOSECURITY", (err, item) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(item);
                }
            });
        });
        const cookieMatches = cookieItem.value.match("COOK::<([^>]+)>");
        return cookieMatches[1];
    } catch (err) {
        console.log("Failed to get cookie from registry:", err);
        return undefined;
    }
}

export async function robloxLogin(username: string, password: string) {
    const jar = request.jar();
    const response = await robloxRequest({
        method: "POST",
        url: "https://auth.roblox.com/v2/login",
        body: {
            ctype: "Username",
            cvalue: username,
            password: password,
        },
        jar: jar,
    });
    for (const cookie of jar.getCookies("https://auth.roblox.com/v2/login")) {
        if (cookie.key === ".ROBLOSECURITY") {
            return cookie.value;
        }
    }
    throw new Error("No cookie returned");
}

export async function devprodUpdate(universeId: number, productId: number, devprodOptions: IDevprodUpdateOptions, cookie: string) {
    const options = {
        method: "POST",
        url: `https://develop.roblox.com/v1/universes/${universeId}/developerproducts/${productId}/update`,
        headers:
        {
            "Cookie": cookie,
            "Content-Type": "application/json",
        },
        body: devprodOptions,
        json: true,
    };
    try {
        const result = await robloxRequest(options);
        return productId;
    } catch (error) {
        if (error.response?.body?.errors) {
            const errData = error.response.body.errors[0];
            if (errData) {
                if (errData.code === 4) {
                    errData.message = "Developer Product with the same name already exists";
                    // default message "Developer product exists already." is not very clear
                    // above replacement is taken from the old "add" API with more user-friendly text
                }
                throw new DevprodError(errData.code ?? -1, errData.message ?? "Unknown error: missing error message from response", error);
            } else {
                throw new DevprodError(-1, "Unknown error: missing specific error data from response", error);
            }
        } else {
            throw new DevprodError(-1, `Unknown error: ${error}`, error);
        }
    }
}

export async function devprodAdd(universeId: number, devprodOptions: IDevprodUpdateOptions, cookie: string) {
    const options = {
        method: "POST",
        url: "https://www.roblox.com/places/developerproducts/add",
        headers: {
            Cookie: cookie,
        },
        form: {
            universeId: universeId,
            name: devprodOptions.Name,
            description: devprodOptions.Description,
            priceInRobux: devprodOptions.PriceInRobux,
            imageAssetId: devprodOptions.IconImageAssetId,
        },
    };
    let result;
    try {
        result = await robloxRequest(options);
    } catch (error) {
        throw new DevprodError(-1, `Unknown error: ${error}`, error);
    }
    const dom = new BeautifulDom.default(result);
    const statusElement = dom.getElementById("DeveloperProductStatus");
    if (statusElement?.getAttribute("class").indexOf("status-confirm") !== -1) {
        const productIdMatch = statusElement.innerText.match(/\d{4,}/);
        if (productIdMatch) {
            const productId = Number.parseInt(productIdMatch[0], 10);
            return productId;
        } else {
            throw new DevprodError(-4, "Unknown error: add success without a returned product id", result);
        }
    } else if (statusElement?.getAttribute("class").indexOf("error-message") !== -1) {
        const message = statusElement.innerText;
        let code = -2;
        if (message.match(/Developer\s+Product\s+with\s+the\s+same\s+name\s+already\s+exists/)) {
            code = 4;
        }
        throw new DevprodError(code, message, result);
    } else {
        throw new DevprodError(-2, `Unknown error: bad response format. Are you logged in? Has the legacy developer products API changed?`, result);
    }
}

// gamepassAdd:
// 1. Send a request to https://www.roblox.com/develop?Page=game-passes to get the __RequestVerificationToken
// 2. Send a request to https://www.roblox.com/build/verifyupload to get the upload page
//   * All fields must be present including the file image and __RequestVerificationToken or 500 Internal Server Error is returned
// 3. Send a request to https://www.roblox.com/build/doverifiedupload with the data and token from #2.

export async function gamepassUpdate(universeId: number, gamepassId: number, devprodOptions: IGamepassUpdateOptions, cookie: string) {
    const newOptions = {
        id: gamepassId,
        name: devprodOptions.name,
        description: devprodOptions.description,
        isForSale: devprodOptions.isForSale,
        price: devprodOptions.price,
    };
    const options = {
        method: "POST",
        url: `https://www.roblox.com/game-pass/update`,
        headers:
        {
            "Cookie": cookie,
            "Content-Type": "application/json",
        },
        body: newOptions,
        json: true,
    };
    let result;
    try {
        result = await robloxRequest(options);
    } catch (error) {
        throw new DevprodError(-1, `Unknown error: ${error}`, error);
    }
    if (result) {
        if (result.isValid) {
            return gamepassId;
        } else {
            throw new DevprodError(-2, result.error, result);
        }
    } else {
        throw new DevprodError(-2, `Unknown error: missing result`, result);
    }
}
