Install with node and `npm install -g devprod` or download packaged binaries from [the releases page](https://github.com/Corecii/Devprod/releases).

# Devprod

Devprod is a tool to create and update Roblox Developer products according to a toml or json file. This can alleviate the pain of clicking through the website when applying large changes such as sales.

[`test-toml.devprod.toml`](./test-toml.devprod.toml) and [`test-json.devprod.json`](./test-json.devprod.json) are example files used for testing.
 is an example file used for testing.

Devprod uses hashes of individual product entries to know when they have changed locally. Devprod will only post changes to the website if it notices that the entry has changed locally. You can override this by either forcing *every* product to post to the website or by removing the entry's hash from the file.

On Windows, Devprod can retrieve your Roblox Studio cookie automatically so you do not have to provide login details or a cookie. Alternatively, you can set the `DEVPROD_COOKIE` environment variable. Devprod does not provide a mechanism for logging in and does not permit passwords or cookies in the command line arguments.

Devprod is one-way: it will only upload changes to the website. Devprod will only download from the website after and upload to warn when text is filtered.

## Examples:

| Command | Explanation |
| :------ | :---------- |
| `devprod game --registry --update` | will use the registry cookie and update changed entries for the `game.devprod.json` file |
| `devprod game -ru` | short version of the above |
| `devprod game --registry --create` | will create products that don't have a product id. The new ids will be saved to the file and output in the terminal. |
| `devprod game -rc` | short version of the above |
| `devprod game --registry --create --update` | will create and update products |
| `devprod game -rcu` | short version of the above |
| `devprod game -r --updateall` | will force-update all entries even if they show no local changes |
| `devprod game --hash` | will recalculate local hashes as if every entry has been updated without pushing changes to the website |
| `devprod game -rcu --preview` | will list the changes to be made for `devprod game -rcu` without making the changes |
| `devprod game -rcup` | short version of the above |
| `devprod --file game.json -rcu` | uses the `game.json` file by direct name instead of `game.devprod.json` |

A short `game.devprod.json`:

```json
{
    "universeId": 1068046093,
    "products": [
        {
            "name": "First product",
            "description": "",
            "price": 50,
            "imageId": 0,
            "productId": 945265100,
            "uploadedHash": "TXKoklTPFo8s5j0uFPm/KE0OW1g="
        },
        {
            "name": "Second product",
            "description": "",
            "price": 100,
            "productId": 945265311,
            "uploadedHash": "439y8RT5rhmPh1M4k3TDYgknR7o="
        }
    ]
}
```

## Product Properties

All properties except `name` are optional.

| Property | Description |
| :------- | :---------- |
| name | The name of the product. Names must be unique. |
| description | The description of the product. |
| price | 0 is off-sale. Values 0 and greater are valid. |
| imageId | The image asset id for the product's icon. |
| productId | The id of the product. If absent, this product does not yet exist on the Roblox website. |
| uploadedHash | The hash calculated from the properties after the product was last updated. |
