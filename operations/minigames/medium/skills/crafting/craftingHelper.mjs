import COOP from "../../../../../organisation/coop.mjs";
import EMOJIS from 'coopshared/config/emojis.mjs';

import SkillsHelper from "../skillsHelper.mjs";

export default class CraftingHelper {

    static CRAFTABLES = {
        BOMB: {
            levelReq: 4,
            xpReward: 2,
            ingredients: {
                STEEL_BAR: 2,
                TOXIC_EGG: 4
            }
        },
        PICK_AXE: {
            levelReq: 1,
            xpReward: 1,
            ingredients: {
                WOOD: 5,
                IRON_BAR: 2
            }
        },
        FRYING_PAN: {
            levelReq: 5,
            xpReward: 2,
            ingredients: {
                STEEL_BAR: 2,
                IRON_BAR: 1
            }
        },
        AXE: {
            levelReq: 1,
            xpReward: 1,
            ingredients: {
                WOOD: 10,
                IRON_BAR: 1
            }
        },
        SHIELD: {
            levelReq: 20,
            xpReward: 3,
            ingredients: {
                GOLD_BAR: 2,
                STEEL_BAR: 3,
                IRON_BAR: 5
            }
        },
    }

    static isItemCraftable(code) {
        return typeof this.CRAFTABLES[code] !== 'undefined';
    }

    // Check whether it is possible for someone to craft an item x qty.
    static async canFulfilIngredients(memberID, itemCode, qty) {
        let craftable = false;

        const ingredients = this.CRAFTABLES[itemCode].ingredients;
        const ingredList = Object.keys(this.CRAFTABLES[itemCode].ingredients);
        const ownedIngredients = await Promise.all(
            ingredList.map(async ingred => ({
                quantity: await COOP.ITEMS.getUserItemQty(memberID, ingred),
                item_code: ingred
            })
        ));

        // Check ingredients are sufficient.
        const checks = ownedIngredients.map(ingred => {
            // Check sufficiency
            const req = ingredients[ingred.item_code] * qty;
            const owned = ingred.quantity;

            // Declare insufficient.
            return {
                sufficient: owned >= req,
                missing: req > owned ? req - owned : 0,
                item_code: ingred.item_code
            }
        });

        // Check all ingredients sufficient.
        if (checks.every(c => c.sufficient)) 
            craftable = true;

        // TODO: Improve.
        // Otherwise pull out the ones that aren't, into an error message:

        // Return a more helpful result.
        // const manifest = { sufficient: false, checks: checks };
        // return manifest;

        return {
            craftable,
            checks
        }
    }

    
    static async craft(memberID, itemCode, qty) {
        try {
            // Access the required ingredients for crafting operation.
            const product = this.CRAFTABLES[itemCode];
            const ingredients = this.CRAFTABLES[itemCode].ingredients;
            const ingredList = Object.keys(this.CRAFTABLES[itemCode].ingredients);

            // Subtract all of the ingredients.
            await Promise.all(
                // TODO: Optimise into one database call.
                ingredList.map(ingred => COOP.ITEMS.subtract(memberID, ingred, ingredients[ingred] * qty, `Crafted ${qty}x${itemCode}`)
            ));

            // Add the resultant item.
            await COOP.ITEMS.add(memberID, itemCode, qty, `Crafted`);

            // Calculate experience
            SkillsHelper.addXP(memberID, 'crafting', product.xpReward * qty);

            // Indicate succesful craft.
            return true;

        } catch(e) {
            console.log('Error occurred crafting');
            console.error(e);
            return false;
        }
    }

    static async userCraftables(userID) {
        let userCraftables = [];
            // Loop though array of craftables and check if user can craft them.
            let craftables = Object.keys(CraftingHelper.CRAFTABLES);
            for(let i = 0; i < craftables.length; i++) {
                let craftable = craftables[i]
                
                // Check if user has enough ingredients and a high enough level.
                const hasIngredients = (await CraftingHelper.canFulfilIngredients(userID, craftable, 1)).craftable;
                const crafterLevel = await SkillsHelper.getLevel('crafting',userID);
                const reqLevel = CraftingHelper.CRAFTABLES[craftable].levelReq;
                if (hasIngredients && crafterLevel >= reqLevel)
                   userCraftables.push(`${EMOJIS[craftable]} (${craftable})`);
            }
            return userCraftables;
    }

    static async allCraftables() {
        let craftables =  Object.keys(CraftingHelper.CRAFTABLES);
        // Convert craftables into emojis.
        return craftables.map((craftable) => `${EMOJIS[craftable]} (${craftable})`);
    }

}