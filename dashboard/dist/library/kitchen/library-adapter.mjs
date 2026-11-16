// Adapt physical samples to the research basket without flattening quantities.
export function createShelfAdapter({basket, shop, products, openShelf}) {
  const product = id => { const p=products.find(p=>p.id===id); if(!p) throw Error('Unknown material.'); return p; };
  return {
    getBasket:()=>[...new Set(basket.inCart().map(r=>r.product.id))],
    subscribe:fn=>basket.onChange(fn),
    async addToBasket(id){const p=product(id);await openShelf();if(!basket.count(id)) await basket.add(p);},
    async removeFromBasket(id){product(id);await openShelf();basket.removeOne(id);},
    async selectMaterial(id){const p=product(id);await openShelf();await shop.openProduct(p);}
  };
}
