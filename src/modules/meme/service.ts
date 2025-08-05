export function getMemeUrl(topText: string, bottomText: string) {
  const baseUrl = 'https://memecomplete.com/share/images/custom';
  const backgroundParam =
    'https%3A%2F%2Fexternal-content.duckduckgo.com%2Fiu%2F%3Fu%3Dhttps%253A%252F%252Fwww.meme-arsenal.com%252Fmemes%252F753d2cb2e64bb0ff7144f2b1b203132d.jpg%26f%3D1%26nofb%3D1%26ipt%3D410106a1840acb84707a7bf33472b424b80353f739a38ae1cb6abde41067b253';
  const token = '0czc5w59hy830pj22koi';
  return `${baseUrl}/${encodeURIComponent(topText)}~q/${encodeURIComponent(bottomText)}?format=jpg&background=${backgroundParam}&token=${token}`;
}
