/* Scenic artwork drawn in SVG so the app needs no photo files: sunrise over mountains, a cross on a hill, a road through a meadow. */
window.Scenes = (function(){
  var P = {
    sunrise: { sky: ['#0a1f4d', '#1b6ef3', '#ffc23d'], sun: '#fff0b8', far: '#3b63b5', mid: '#1d3f8f', near: '#0e2a6b', ground: '#08183f' },
    dawn:    { sky: ['#14307a', '#4d8dff', '#ffd27a'], sun: '#fff3cf', far: '#4a6cc0', mid: '#27499d', near: '#13307a', ground: '#0a1f4d' },
    night:   { sky: ['#050f2b', '#0f2a6e', '#e9a21f'], sun: '#ffd77a', far: '#1d3a85', mid: '#112a6a', near: '#0a1c4d', ground: '#060f2b' },
    meadow:  { sky: ['#1b6ef3', '#7fb4ff', '#ffe08a'], sun: '#fff6d8', far: '#4d7bd0', mid: '#2c58ad', near: '#1a3f8a', ground: '#e0a526' }
  };
  function ridge(w, h, base, amp, seed, fill){
    var x = 0, pts = [], r = seed;
    while(x <= w + 40){ r = (r * 9301 + 49297) % 233280; pts.push([x, base - (r / 233280) * amp]); x += 36; }
    var d = 'M0 ' + h + ' L' + pts.map(function(p){ return p[0].toFixed(0) + ' ' + p[1].toFixed(0); }).join(' L') + ' L' + (w + 40) + ' ' + h + ' Z';
    return '<path d="' + d + '" fill="' + fill + '"/>';
  }
  /* kind: sunrise | dawn | night | meadow.  opts: cross (bool), road (bool), id (unique gradient id) */
  function svg(kind, opts){
    opts = opts || {}; var c = P[kind] || P.sunrise, w = 800, h = 400, id = 'g' + Math.random().toString(36).slice(2, 7);
    var sunX = opts.sunX || (opts.cross ? 560 : 400), sunY = 235;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c.sky[0] + '"/><stop offset=".6" stop-color="' + c.sky[1] + '"/><stop offset="1" stop-color="' + c.sky[2] + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'o" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="' + c.sun + '" stop-opacity=".95"/><stop offset=".35" stop-color="' + c.sun + '" stop-opacity=".45"/><stop offset="1" stop-color="' + c.sun + '" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#' + id + 's)"/>';
    if(kind === 'night') for(var i = 0; i < 40; i++) s += '<circle cx="' + ((i * 137) % w) + '" cy="' + ((i * 59) % 190) + '" r="' + (i % 3 ? 1 : 1.6) + '" fill="#fff" opacity=".7"/>';
    for(var b = 0; b < 7; b++) s += '<polygon points="' + sunX + ',' + sunY + ' ' + (sunX - 420 + b * 140) + ',0 ' + (sunX - 340 + b * 140) + ',0" fill="' + c.sun + '" opacity=".07"/>';
    s += '<circle cx="' + sunX + '" cy="' + sunY + '" r="190" fill="url(#' + id + 'o)"/><circle cx="' + sunX + '" cy="' + sunY + '" r="26" fill="' + c.sun + '"/>';
    s += ridge(w, h, 270, 90, 11, c.far) + ridge(w, h, 310, 80, 23, c.mid) + ridge(w, h, 350, 60, 37, c.near);
    s += '<rect y="372" width="' + w + '" height="40" fill="' + c.ground + '"/>';
    if(opts.road) s += '<polygon points="340,400 460,400 418,290 382,290" fill="#d9bd78" opacity=".9"/><polygon points="392,400 408,400 402,290 398,290" fill="#fff6d8" opacity=".55"/>';
    if(opts.cross) s += '<g transform="translate(' + sunX + ' ' + (sunY - 95) + ')"><rect x="-5" y="0" width="10" height="150" fill="#2a1d12"/><rect x="-34" y="32" width="68" height="10" fill="#2a1d12"/><rect x="-5" y="0" width="3" height="150" fill="#f4c36f" opacity=".7"/></g>';
    return s + '</svg>';
  }
  return { svg: svg };
})();
