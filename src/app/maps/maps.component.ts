import { Component, OnInit, OnChanges, OnDestroy, Input, SimpleChange, SimpleChanges } from '@angular/core';
import Map from 'ol/Map';
import 'ol/ol.css';
import Draw from 'ol/interaction/Draw';
import Feature from 'ol/Feature';
import Fill from 'ol/style/Fill';
import GeoJSON from 'ol/format/GeoJSON';
import Snap from 'ol/interaction/Snap';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import View from 'ol/View';
import {OSM, Vector as VectorSource} from 'ol/source';
import {Tile as TileLayer, Vector as VectorLayer} from 'ol/layer';
import LineString from 'ol/geom/LineString.js';

@Component({
  selector: 'app-maps',
  templateUrl: './maps.component.html',
  styleUrls: ['./maps.component.css']
})
export class MapsComponent implements OnChanges, OnInit  {

  map;
  polyline;
  geometry;
  drawInteraction;
  drawVector;
  drawing: boolean = false;
  snapInteraction;
  previewLine;
  tracingFeature;
  @Input() valor: string = 'None';

  @Input() options: Array<string> = ['Polygon', 'LineString', 'None']

  constructor() { }

  ngOnInit(): void {
    this.inicializar();
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log(changes)
    this.addInteraction();
  }

  length(a, b) {
    return Math.sqrt(
      (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])
    );
  }

  isOnSegment(c, a, b) {
    var lengthAc = this.length(a, c);
    var lengthAb = this.length(a, b);
    var dot =
      ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / lengthAb;
    return Math.abs(lengthAc - dot) < 1e-6 && lengthAc < lengthAb;
  }

  mod(a, b) {
    return ((a % b) + b) % b;
  }

  getPartialRingCoords(feature, startPoint, endPoint) {
    var polygon = feature.getGeometry();
    if (polygon.getType() === 'MultiPolygon') {
      polygon = polygon.getPolygon(0);
    }
    var ringCoords = polygon.getLinearRing().getCoordinates();
  
    var i,
      pointA,
      pointB,
      startSegmentIndex = -1;
    for (i = 0; i < ringCoords.length; i++) {
      pointA = ringCoords[i];
      pointB = ringCoords[this.mod(i + 1, ringCoords.length)];
  
      // check if this is the start segment dot product
      if (this.isOnSegment(startPoint, pointA, pointB)) {
        startSegmentIndex = i;
        break;
      }
    }
  
    var cwCoordinates = [];
    var cwLength = 0;
    var ccwCoordinates = [];
    var ccwLength = 0;
  
    // build clockwise coordinates
    for (i = 0; i < ringCoords.length; i++) {
      pointA =
        i === 0
          ? startPoint
          : ringCoords[this.mod(i + startSegmentIndex, ringCoords.length)];
      pointB = ringCoords[this.mod(i + startSegmentIndex + 1, ringCoords.length)];
      cwCoordinates.push(pointA);
  
      if (this.isOnSegment(endPoint, pointA, pointB)) {
        cwCoordinates.push(endPoint);
        cwLength += this.length(pointA, endPoint);
        break;
      } else {
        cwLength += this.length(pointA, pointB);
      }
    }
  
    // build counter-clockwise coordinates
    for (i = 0; i < ringCoords.length; i++) {
      pointA = ringCoords[this.mod(startSegmentIndex - i, ringCoords.length)];
      pointB =
        i === 0
          ? startPoint
          : ringCoords[this.mod(startSegmentIndex - i + 1, ringCoords.length)];
      ccwCoordinates.push(pointB);
  
      if (this.isOnSegment(endPoint, pointA, pointB)) {
        ccwCoordinates.push(endPoint);
        ccwLength += this.length(endPoint, pointB);
        break;
      } else {
        ccwLength += this.length(pointA, pointB);
      }
    }
  
    // keep the shortest path
    return ccwLength < cwLength ? ccwCoordinates : cwCoordinates;
  }

  inicializar() {
    var raster = new TileLayer({
      source: new OSM(),
    });
    
    var baseVector = new VectorLayer({
      source: new VectorSource({
        format: new GeoJSON(),
        url:
          "https://ahocevar.com/geoserver/wfs?service=wfs&request=getfeature&typename=topp:states&cql_filter=STATE_NAME='Idaho'&outputformat=application/json",
      }),
    });

    var raster = new TileLayer({
      source: new OSM(),
    });
    
    this.drawVector = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({
          color: 'rgba(100, 255, 0, 1)',
          width: 2,
        }),
        fill: new Fill({
          color: 'rgba(100, 255, 0, 0.3)',
        }),
      }),
    });

    this.previewLine = new Feature({
      geometry: new LineString([]),
    });
    var previewVector = new VectorLayer({
      source: new VectorSource({
        features: [this.previewLine],
      }),
      style: new Style({
        stroke: new Stroke({
          color: 'rgba(255, 0, 0, 1)',
          width: 2,
        }),
      }),
    });
    
    this.map = new Map({
      layers: [raster, baseVector, this.drawVector, previewVector],
      target: 'map',
      view: new View({
        center: [-12986427, 5678422],
        zoom: 5,
      }),
    });

    var startPoint, endPoint;
    this.drawing = false;

  var getFeatureOptions = {
  hitTolerance: 10,
  layerFilter: function (layer) {
    return layer === baseVector;
  },
};

this.map.on('click', function (event) {
  if (!this.drawing) {
    return;
  }

  var hit = false;
  this.map.forEachFeatureAtPixel(
    event.pixel,
    function (feature) {
      if (this.tracingFeature && feature !== this.tracingFeature) {
        return;
      }

      hit = true;
      var coord = this.map.getCoordinateFromPixel(event.pixel);

      // second click on the tracing feature: append the ring coordinates
      if (feature === this.tracingFeature) {
        endPoint = this.tracingFeature.getGeometry().getClosestPoint(coord);
        var appendCoords = this.getPartialRingCoords(
          this.tracingFeature,
          startPoint,
          endPoint
        );
        this.drawInteraction.removeLastPoint();
        this.drawInteraction.appendCoordinates(appendCoords);
        this.tracingFeature = null;
      }

      // start tracing on the feature ring
      this.tracingFeature = feature;
      startPoint = this.tracingFeature.getGeometry().getClosestPoint(coord);
    },
    getFeatureOptions
  );

  if (!hit) {
    // clear current tracing feature & preview
    this.previewLine.getGeometry().setCoordinates([]);
    this.tracingFeature = null;
  }
});

this.map.on('pointermove', function (event) {
  if (this.tracingFeature && this.drawing) {
    var coord = null;
    this.map.forEachFeatureAtPixel(
      event.pixel,
      function (feature) {
        if (this.tracingFeature === feature) {
          coord = this.map.getCoordinateFromPixel(event.pixel);
        }
      },
      getFeatureOptions
    );

    var previewCoords = [];
    if (coord) {
      endPoint = this.tracingFeature.getGeometry().getClosestPoint(coord);
      previewCoords = this.getPartialRingCoords(
        this.tracingFeature,
        startPoint,
        endPoint
      );
    }
    this.previewLine.getGeometry().setCoordinates(previewCoords);
  }
});

this.snapInteraction = new Snap({
  source: baseVector.getSource(),
});

  }

 addInteraction() {
    var value =  this.geometry !== undefined ? this.geometry.value : 'None';
    if (value !== 'None') {
      console.log(this.geometry.value)
      this.drawInteraction = new Draw({
        source: this.drawVector.getSource(),
        type: this.geometry.value,
      });
      this.drawInteraction.on('drawstart', function () {
        this.drawing = true;
      });
      this.drawInteraction.on('drawend', function () {
        this.drawing = false;
        this.previewLine.getGeometry().setCoordinates([]);
        this.tracingFeature = null;
      });
      this.map.addInteraction(this.drawInteraction);
      this.map.addInteraction(this.snapInteraction);
    }
  }

selectionChange(event: any){
  this.geometry = event;
  console.log(this.valor)
  this.valor = event.value;
}
}
