(function (DB) {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const bgCanvas = $('bg');
  const fxCanvas = $('fx');

  DB.dom = {
    stage:        $('stage'),
    world:        $('world'),
    bgCanvas:     bgCanvas,
    fxCanvas:     fxCanvas,
    bgCtx:        bgCanvas.getContext('2d'),
    fxCtx:        fxCanvas.getContext('2d'),
    weaponLayer:  $('weapon-layer'),
    targetLayer:  $('target-layer'),
    termLines:    $('term-lines'),
    hpPipsEl:     $('hp-pips'),
    energySlotsEl:$('energy-slots'),
    flashEl:      $('flash'),
    titleEl:      $('title-screen')      // 新增
  };

})(window.DB);