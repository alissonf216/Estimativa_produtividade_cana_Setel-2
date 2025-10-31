// ======================================================
// 🧭 CONFIGURAÇÕES INICIAIS
// ======================================================

// Substitua pela geometria real dos seus talhões (T001 e T002)
var talhoes = ee.FeatureCollection([
  ee.Feature(
    ee.Geometry.Polygon([
      [[-54.374231748796944, -21.580033618587567],
       [-54.39706271193171, -21.59184566243295],
       [-54.385733061052804, -21.621211971853427],
       [-54.36032717726374, -21.609721517265893]]]),
    {id_talhao: 'T001'}
  ),
  ee.Feature(
    ee.Geometry.Polygon([
      [[-54.35603242376561, -21.585124412929495],
       [-54.33131318548436, -21.604916326017733],
       [-54.30316071966405, -21.554473533596518],
       [-54.32307343939061, -21.54553247315377]]]),
    {id_talhao: 'T002'}
  )
]);

// Intervalo de análise
var startYear = 2019;
var endYear = 2025;

// ======================================================
// 📦 IMAGENS SENTINEL-2 E CÁLCULO DE ÍNDICES
// ======================================================
function maskClouds(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(mask);
}

function addIndices(image) {
  var ndvi = image.normalizedDifference(['B8','B4']).rename('NDVI');
  var evi = image.expression(
      '2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))',
      {
        'NIR': image.select('B8'),
        'RED': image.select('B4'),
        'BLUE': image.select('B2')
      }).rename('EVI');
  var ndwi = image.normalizedDifference(['B3','B8']).rename('NDWI');
  return image.addBands([ndvi, evi, ndwi]);
}

// ======================================================
// 🔁 LOOP ANUAL – MÉTRICAS POR TALHÃO
// ======================================================
var results = ee.FeatureCollection([]);

for (var year = startYear; year <= endYear; year++) {

  var start = ee.Date.fromYMD(year, 1, 1);
  var end = ee.Date.fromYMD(year, 12, 31);

  var s2 = ee.ImageCollection('COPERNICUS/S2_SR')
    .filterBounds(talhoes)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .map(maskClouds)
    .map(addIndices);

  // NDVI, EVI, NDWI mean/max/min
  var mean = s2.select(['NDVI', 'EVI', 'NDWI']).mean();
  var max = s2.select(['NDVI', 'EVI', 'NDWI']).max();
  var min = s2.select(['NDVI', 'EVI', 'NDWI']).min();

  // Cálculo de amplitude (max - min)
  var amp = max.subtract(min).rename(['NDVI_amp', 'EVI_amp', 'NDWI_amp']);

  var stack = mean.addBands(max).addBands(min).addBands(amp);

  var reduced = stack.reduceRegions({
    collection: talhoes,
    reducer: ee.Reducer.mean(),
    scale: 10
  }).map(function(f){
    return f.set('ano', year);
  });

  results = results.merge(reduced);
}

// ======================================================
// 💾 EXPORTAÇÃO PARA DRIVE
// ======================================================
Export.table.toDrive({
  collection: results,
  description: 'Indices_GEE_Talhoes_2019_2025',
  fileFormat: 'CSV'
});

// ======================================================
// 🗺️ VISUALIZAÇÃO (opcional)
// ======================================================
Map.centerObject(talhoes, 11);
Map.addLayer(talhoes, {color: 'red'}, 'Talhões');
Map.addLayer(ee.ImageCollection('COPERNICUS/S2_SR').filterDate('2024-05-01', '2024-06-01').median().select(['B4','B3','B2']), {min:0,max:3000}, 'Sentinel-2 RGB');
